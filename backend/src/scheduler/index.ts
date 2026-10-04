import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { campaignRepo } from "../modules/campaign/campaign.repo.js";
import { templatesRepo } from "../modules/templates/templates.repo.js";
import { logsRepo } from "../modules/logs/logs.repo.js";
import { settingsService } from "../modules/settings/settings.service.js";
import { personalize } from "../integrations/gemini/client.js";
import { getEmailProvider } from "../integrations/email/factory.js";
import type { EmailProvider } from "../integrations/email/provider.js";
import { sendEmailJob, type SendEmailDeps } from "../jobs/send-email.js";
import { campaignTick, type CampaignTickDeps } from "./tick.js";
import { INBOX } from "../config/constants.js";
import { inboxRepo } from "../modules/inbox/inbox.repo.js";
import { runClassifyForUser, runSyncForUser } from "../modules/inbox/inbox.service.js";

// Tracks userIds whose campaign was auto-paused by hitting the Gmail daily quota,
// so the midnight job only auto-resumes quota-pauses (not manual pauses).
const autoPausedUsers = new Set<number>();

/** Constructs the active EmailProvider for a specific user from stored (decrypted) credentials. */
async function buildProviderForUser(userId: number): Promise<EmailProvider> {
  const provider = await settingsService.getEmailProviderName(userId);
  const creds = await settingsService.getGmailCreds(userId);
  if (!creds) throw new Error(`Email provider not configured for user ${userId} (missing Gmail credentials)`);
  return getEmailProvider({ provider, gmail: { user: creds.email, pass: creds.password } });
}

/** Wires real send-email dependencies for a specific user. */
function buildSendDeps(userId: number): SendEmailDeps {
  return {
    campaign: {
      getContact: (id) => campaignRepo.getContact(id),
      getSettings: async () => {
        const s = await campaignRepo.getSettings(userId);
        return s ? { mode: s.mode, testEmail: s.testEmail } : null;
      },
      setState: (state) => campaignRepo.setState(userId, state),
      markContactProcessing: (id) => campaignRepo.markContactProcessing(id),
      markContactSent: (id, sentAt) => campaignRepo.markContactSent(id, sentAt),
      markContactBounced: (id) => campaignRepo.markContactBounced(id),
      markContactFailed: (id) => campaignRepo.markContactFailed(id),
      scheduleRetry: (id, count, next) => campaignRepo.scheduleRetry(id, count, next),
      resetContactPending: (id) => campaignRepo.resetContactPending(id),
      incQuota: (d) => campaignRepo.incQuota(userId, d),
    },
    templates: {
      pickRandomActive: (options) => templatesRepo.pickRandomActive(userId, options),
    },
    settings: {
      getGeminiKey: () => settingsService.getGeminiKey(userId),
      getCandidateProfile: () => settingsService.getCandidateProfile(userId),
      buildSignature: (p) => settingsService.buildSignature(p),
      getResumeAttachment: (resumeId) => settingsService.getResumeAttachment(userId, resumeId),
      getResumePath: async (resumeId) => {
        const att = await settingsService.getResumeAttachment(userId, resumeId);
        return att?.path ?? null;
      },
    },
    personalize,
    getProvider: () => buildProviderForUser(userId),
    logs: {
      create: (log) => logsRepo.create(userId, log),
    },
  };
}

/** Wires campaign-tick dependencies for a specific user. */
function buildTickDeps(userId: number): CampaignTickDeps {
  const sendDeps = buildSendDeps(userId);
  return {
    getTickSettings: async () => {
      const s = await campaignRepo.getSettings(userId);
      return s ? { state: s.state, startHour: s.startHour, endHour: s.endHour } : null;
    },
    getSettings: async () => {
      const s = await campaignRepo.getSettings(userId);
      return s
        ? { state: s.state, dailyLimit: s.dailyLimit, startHour: s.startHour, endHour: s.endHour }
        : null;
    },
    getQuota: (d) => campaignRepo.getQuota(userId, d),
    countScheduledForDay: (d) => campaignRepo.countScheduledForDay(userId, d),
    selectableContacts: (limit, now) => campaignRepo.selectableContacts(userId, limit, now),
    enqueue: (rows) => campaignRepo.enqueue(userId, rows),
    dueQueueItems: (now, limit) => campaignRepo.dueQueueItems(userId, now, limit),
    markQueue: (id, status) => campaignRepo.markQueue(id, status),
    runSendJob: async (contactId) => {
      const result = await sendEmailJob(contactId, sendDeps);
      if (result.outcome === "paused") autoPausedUsers.add(userId);
      return result;
    },
  };
}

// Tracks userIds currently executing a tick to prevent overlapping/simultaneous sends.
const userRunningTicks = new Set<number>();

/**
 * Tracks userIds currently syncing their inbox.
 *
 * Process-local, exactly like userRunningTicks above. With more than one backend
 * replica two processes can sync the same user at once, which is harmless here: the
 * UID unique index plus onConflictDoNothing makes ingestion idempotent and the trash
 * flow is UID-keyed, so the worst case is duplicated work, never duplicated rows.
 * If this ever scales out, wrap the pass in
 * SELECT pg_try_advisory_lock(hashtext('inbox-sync:' || $userId)).
 */
const inboxRunningUsers = new Set<number>();

/**
 * One pass over every user whose backoff window has expired.
 *
 * Users are processed SEQUENTIALLY — a deliberate divergence from the send tick,
 * which fans out concurrently — so N users never means N simultaneous IMAP sockets.
 */
async function runInboxPass(now: Date): Promise<void> {
  const userIds = await inboxRepo.listSyncableUserIds(now);
  for (const userId of userIds) {
    if (inboxRunningUsers.has(userId)) {
      logger.debug({ userId }, "inbox sync already in progress — skipping");
      continue;
    }
    inboxRunningUsers.add(userId);
    try {
      const synced = await runSyncForUser(userId);
      // Only classify when something actually arrived, so an idle account costs
      // nothing and no Gemini quota is spent on an empty pass.
      if (synced.outcome === "ok" && synced.inserted > 0) {
        const sorted = await runClassifyForUser(userId, "new");
        logger.info(
          { userId, inserted: synced.inserted, byRule: sorted.byRule, byAi: sorted.byAi },
          "inbox synced and sorted",
        );
      }
    } catch (err) {
      logger.error({ err, userId }, "inbox sync pass failed");
    } finally {
      inboxRunningUsers.delete(userId);
    }
  }
}

/** Nightly housekeeping: retention, trash cleanup, and stuck-delete recovery. */
async function runInboxRetention(now: Date): Promise<void> {
  // Fail-open recovery first: a delete interrupted by a crash must not leave a
  // message hidden forever, so anything stuck comes back into the inbox.
  const restored = await inboxRepo.revertStaleTrashPending(
    new Date(now.getTime() - INBOX.TRASH_PENDING_STALE_MS),
  );

  // Retention is a hard requirement, not a nicety: these rows hold real personal
  // mail in plaintext, so the window past which we stop keeping it is enforced.
  const purgedActive = await inboxRepo.purgeOldMessages(
    new Date(now.getTime() - INBOX.RETENTION_DAYS * 86_400_000),
  );
  const purgedTrash = await inboxRepo.purgeTrashed(
    new Date(now.getTime() - INBOX.TRASH_RETENTION_DAYS * 86_400_000),
  );

  logger.info({ restored, purgedActive, purgedTrash }, "inbox retention pass finished");
}

/** Starts the per-minute multi-user campaign ticks and the midnight auto-resume job. */
export function startScheduler(): void {
  // Every minute: process at most one due email per active running user.
  cron.schedule("* * * * *", () => {
    void (async () => {
      try {
        const runningCampaigns = await campaignRepo.getAllRunningSettings();
        for (const camp of runningCampaigns) {
          const userId = camp.userId;
          if (userRunningTicks.has(userId)) {
            logger.debug({ userId }, "campaign tick already in progress — skipping overlapping tick");
            continue;
          }
          userRunningTicks.add(userId);
          const userDeps = buildTickDeps(userId);
          campaignTick(userDeps, new Date())
            .catch((err) => {
              logger.error({ err, userId }, "user campaign tick failed");
            })
            .finally(() => {
              userRunningTicks.delete(userId);
            });
        }
      } catch (err) {
        logger.error({ err }, "scheduler tick loop failed");
      }
    })();
  });

  // Midnight: auto-resume quota-paused campaigns for all users.
  cron.schedule("0 0 * * *", () => {
    void (async () => {
      try {
        for (const userId of autoPausedUsers) {
          const s = await campaignRepo.getSettings(userId);
          if (s?.state === "PAUSED") {
            await campaignRepo.setState(userId, "RUNNING");
            logger.info({ userId }, "campaign auto-resumed for the new day after quota pause");
          }
        }
        autoPausedUsers.clear();
      } catch (err) {
        logger.error({ err }, "midnight auto-resume failed");
      }
    })();
  });

  // Every 10 minutes: pull new inbox mail and sort it.
  //
  // Deliberately decoupled from the per-minute send tick so a slow IMAP round-trip
  // can never delay an outgoing email. One short-lived connection per user per tick
  // is 144/day — nowhere near Gmail's limits, and responsive enough for an inbox.
  cron.schedule(INBOX.SYNC_CRON, () => {
    void runInboxPass(new Date()).catch((err) => {
      logger.error({ err }, "inbox scheduler loop failed");
    });
  });

  // 3am: inbox retention and stuck-delete recovery.
  cron.schedule("0 3 * * *", () => {
    void runInboxRetention(new Date()).catch((err) => {
      logger.error({ err }, "inbox retention pass failed");
    });
  });

  logger.info("multi-user scheduler started (per-minute send tick, 10-minute inbox sync, midnight auto-resume, 3am retention)");
}
