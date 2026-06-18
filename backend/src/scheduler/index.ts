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

// Tracks whether the campaign was auto-paused by hitting the Gmail daily quota,
// so the midnight job only auto-resumes quota-pauses (not manual pauses).
let autoPausedByQuota = false;

/** Constructs the active EmailProvider from stored (decrypted) credentials. */
async function buildProvider(): Promise<EmailProvider> {
  const provider = await settingsService.getEmailProviderName();
  const creds = await settingsService.getGmailCreds();
  if (!creds) throw new Error("Email provider not configured (missing Gmail credentials)");
  return getEmailProvider({ provider, gmail: { user: creds.email, pass: creds.password } });
}

/** Wires the real send-email dependencies. */
function buildSendDeps(): SendEmailDeps {
  return {
    campaign: campaignRepo,
    templates: { pickRandomActive: () => templatesRepo.pickRandomActive() },
    settings: {
      getGeminiKey: () => settingsService.getGeminiKey(),
      getCandidateProfile: () => settingsService.getCandidateProfile(),
      buildSignature: (p) => settingsService.buildSignature(p),
      getResumePath: () => settingsService.getResumePath(),
    },
    personalize,
    getProvider: buildProvider,
    logs: logsRepo,
  };
}

/** Wires the real campaign-tick dependencies. */
function buildTickDeps(): CampaignTickDeps {
  const sendDeps = buildSendDeps();
  return {
    getTickSettings: async () => {
      const s = await campaignRepo.getSettings();
      return s ? { state: s.state, startHour: s.startHour, endHour: s.endHour } : null;
    },
    getSettings: async () => {
      const s = await campaignRepo.getSettings();
      return s
        ? { state: s.state, dailyLimit: s.dailyLimit, startHour: s.startHour, endHour: s.endHour }
        : null;
    },
    getQuota: (d) => campaignRepo.getQuota(d),
    countScheduledForDay: (d) => campaignRepo.countScheduledForDay(d),
    selectableContacts: (limit, now) => campaignRepo.selectableContacts(limit, now),
    enqueue: (rows) => campaignRepo.enqueue(rows),
    dueQueueItems: (now, limit) => campaignRepo.dueQueueItems(now, limit),
    markQueue: (id, status) => campaignRepo.markQueue(id, status),
    runSendJob: async (contactId) => {
      const result = await sendEmailJob(contactId, sendDeps);
      if (result.outcome === "paused") autoPausedByQuota = true;
      return result;
    },
  };
}

/** Starts the per-minute campaign tick and the midnight auto-resume job. */
export function startScheduler(): void {
  const tickDeps = buildTickDeps();

  // Every minute: process at most one due email.
  cron.schedule("* * * * *", () => {
    campaignTick(tickDeps, new Date()).catch((err) => {
      logger.error({ err }, "campaign tick failed");
    });
  });

  // Midnight: auto-resume a quota-paused campaign for the new day.
  cron.schedule("0 0 * * *", () => {
    void (async () => {
      try {
        const s = await campaignRepo.getSettings();
        if (autoPausedByQuota && s?.state === "PAUSED") {
          await campaignRepo.setState("RUNNING");
          autoPausedByQuota = false;
          logger.info("campaign auto-resumed for the new day after quota pause");
        }
      } catch (err) {
        logger.error({ err }, "midnight auto-resume failed");
      }
    })();
  });

  logger.info("scheduler started (per-minute tick + midnight auto-resume)");
}
