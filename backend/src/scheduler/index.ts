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
      getResumePath: () => settingsService.getResumePath(userId),
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

/** Starts the per-minute multi-user campaign ticks and the midnight auto-resume job. */
export function startScheduler(): void {
  // Every minute: process at most one due email per active running user.
  cron.schedule("* * * * *", () => {
    void (async () => {
      try {
        const runningCampaigns = await campaignRepo.getAllRunningSettings();
        for (const camp of runningCampaigns) {
          const userDeps = buildTickDeps(camp.userId);
          await campaignTick(userDeps, new Date()).catch((err) => {
            logger.error({ err, userId: camp.userId }, "user campaign tick failed");
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

  logger.info("multi-user scheduler started (per-minute tick + midnight auto-resume)");
}
