import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { campaignRepo, type Campaign } from "../modules/campaign/campaign.repo.js";
import { genDeps, campaignLookups } from "../modules/campaign/campaign.service.js";
import { sendersService } from "../modules/senders/senders.service.js";
import { templatesRepo } from "../modules/templates/templates.repo.js";
import { logsRepo } from "../modules/logs/logs.repo.js";
import { settingsService } from "../modules/settings/settings.service.js";
import { personalize } from "../integrations/gemini/client.js";
import { getEmailProvider } from "../integrations/email/factory.js";
import type { EmailProvider } from "../integrations/email/provider.js";
import { sendEmailJob, type SendEmailDeps } from "../jobs/send-email.js";
import { senderTick, type CampaignTickDeps } from "./tick.js";
import { INBOX } from "../config/constants.js";
import { inboxRepo } from "../modules/inbox/inbox.repo.js";
import { runClassifyForUser, runSyncForUser } from "../modules/inbox/inbox.service.js";

// Campaign ids auto-paused by hitting their sender's Gmail daily quota, so the midnight
// job only auto-resumes quota-pauses (not manual pauses).
const autoPausedCampaigns = new Set<number>();

/** EmailProvider for the account a campaign sends from (null = the primary Gmail). */
async function buildProviderForSender(userId: number, senderAccountId: number | null): Promise<EmailProvider> {
  const provider = await settingsService.getEmailProviderName(userId);
  const creds = await sendersService.getCreds(userId, senderAccountId);
  if (!creds) {
    throw new Error(`Sender not configured for user ${userId} (account ${senderAccountId ?? "primary"})`);
  }
  return getEmailProvider({ provider, gmail: { user: creds.email, pass: creds.password } });
}

/** Wires real send-email dependencies for one campaign. `senderCampaignIds` are the
 *  running campaigns sharing its sending account. */
function buildSendDeps(campaign: Campaign, senderCampaignIds: number[]): SendEmailDeps {
  const { userId } = campaign;
  return {
    campaign: {
      getContact: (id) => campaignRepo.getContact(id),
      getSettings: async () => {
        const c = await campaignRepo.getById(campaign.id);
        return c
          ? { mode: c.mode, testEmail: c.testEmail, language: c.language, aiEnabled: c.aiEnabled, aiInstructions: c.aiInstructions }
          : null;
      },
      // Gmail's quota is per account, so hitting it pauses every campaign on that sender.
      setState: async (state) => {
        for (const id of senderCampaignIds) await campaignRepo.setState(id, state);
      },
      markContactProcessing: (id) => campaignRepo.markContactProcessing(id),
      markContactSent: (id, sentAt) => campaignRepo.markContactSent(id, sentAt),
      markContactBounced: (id) => campaignRepo.markContactBounced(id),
      markContactFailed: (id) => campaignRepo.markContactFailed(id),
      scheduleRetry: (id, count, next) => campaignRepo.scheduleRetry(id, count, next),
      resetContactPending: (id) => campaignRepo.resetContactPending(id),
      incQuota: (d) => campaignRepo.incQuota(userId, d),
    },
    templates: {
      pickRandomActive: (options) => templatesRepo.pickForCampaign(userId, campaign.id, options),
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
      getProfileVars: () => settingsService.getProfileVars(userId),
    },
    personalize,
    getProvider: () => buildProviderForSender(userId, campaign.senderAccountId),
    logs: {
      create: (log) => logsRepo.create(userId, { ...log, campaignId: campaign.id }),
    },
  };
}

/** Wires campaign-tick dependencies for one campaign. */
function buildTickDeps(campaign: Campaign, senderCampaignIds: number[]): CampaignTickDeps {
  const sendDeps = buildSendDeps(campaign, senderCampaignIds);
  return {
    ...genDeps(campaign, campaignRepo, campaignLookups),
    getTickSettings: async () => {
      const c = await campaignRepo.getById(campaign.id);
      return c ? { state: c.state, startHour: c.startHour, endHour: c.endHour } : null;
    },
    dueQueueItems: (now, limit) => campaignRepo.dueQueueItems(campaign.id, now, limit),
    markQueue: (id, status) => campaignRepo.markQueue(id, status),
    runSendJob: async (contactId) => {
      const result = await sendEmailJob(contactId, sendDeps);
      if (result.outcome === "paused") senderCampaignIds.forEach((id) => autoPausedCampaigns.add(id));
      return result;
    },
  };
}

/** Campaigns sharing a key send from the same Gmail account. */
function senderKey(c: Campaign): string {
  return c.senderAccountId == null ? `primary:${c.userId}` : `account:${c.senderAccountId}`;
}

// Sender keys currently executing a tick, to prevent overlapping/simultaneous sends
// from one Gmail account.
const senderRunningTicks = new Set<string>();

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

/** Starts the per-minute per-sender campaign ticks and the midnight auto-resume job. */
export function startScheduler(): void {
  // Every minute: per sending account, process at most one due email across its running campaigns.
  cron.schedule("* * * * *", () => {
    void (async () => {
      try {
        const running = await campaignRepo.getAllRunning();
        const bySender = new Map<string, Campaign[]>();
        for (const c of running) bySender.set(senderKey(c), [...(bySender.get(senderKey(c)) ?? []), c]);

        for (const [key, group] of bySender) {
          if (senderRunningTicks.has(key)) {
            logger.debug({ sender: key }, "sender tick already in progress — skipping overlapping tick");
            continue;
          }
          senderRunningTicks.add(key);
          const ids = group.map((c) => c.id);
          senderTick(group.map((c) => buildTickDeps(c, ids)), new Date())
            .catch((err) => {
              logger.error({ err, sender: key, campaignIds: ids }, "sender campaign tick failed");
            })
            .finally(() => {
              senderRunningTicks.delete(key);
            });
        }
      } catch (err) {
        logger.error({ err }, "scheduler tick loop failed");
      }
    })();
  });

  // Midnight: auto-resume campaigns that were paused by a sender hitting its quota.
  cron.schedule("0 0 * * *", () => {
    void (async () => {
      try {
        for (const id of autoPausedCampaigns) {
          const c = await campaignRepo.getById(id);
          if (c?.state === "PAUSED") {
            await campaignRepo.setState(id, "RUNNING");
            logger.info({ campaignId: id, userId: c.userId }, "campaign auto-resumed for the new day after quota pause");
          }
        }
        autoPausedCampaigns.clear();
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

  logger.info("multi-campaign scheduler started (per-minute per-sender send tick, 10-minute inbox sync, midnight auto-resume, 3am retention)");
}
