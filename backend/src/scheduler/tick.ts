import { logger } from "../utils/logger.js";
import { generateDailyQueue, type GenerateQueueDeps } from "../jobs/generate-queue.js";
import type { SendOutcome } from "../jobs/send-email.js";

export interface TickSettings {
  state: string;
  startHour: number;
  endHour: number;
}

export interface CampaignTickDeps extends GenerateQueueDeps {
  getTickSettings(): Promise<TickSettings | null>;
  dueQueueItems(now: Date, limit: number): Promise<{ id: number; contactId: number }[]>;
  markQueue(id: number, status: "PROCESSING" | "DONE" | "CANCELLED" | "SCHEDULED"): Promise<void>;
  runSendJob(contactId: number): Promise<{ outcome: SendOutcome }>;
}

/** One scheduler tick (runs every minute). Sends AT MOST ONE due email to
 *  enforce no-bulk / no-simultaneous sending. Respects state + window + quota.
 *  Stops early if the campaign auto-pauses (quota hit) mid-tick. */
export async function campaignTick(deps: CampaignTickDeps, now: Date): Promise<void> {
  const settings = await deps.getTickSettings();
  if (!settings || settings.state !== "RUNNING") return;

  const hour = now.getHours();
  if (hour < settings.startHour || hour >= settings.endHour) return;

  // Ensure today's queue exists (idempotent).
  await generateDailyQueue(deps, now);

  // Process at most one due item this tick.
  const due = await deps.dueQueueItems(now, 1);
  if (due.length === 0) return;

  const item = due[0];
  await deps.markQueue(item.id, "PROCESSING");
  try {
    const result = await deps.runSendJob(item.contactId);
    await deps.markQueue(item.id, "DONE");
    if (result.outcome === "paused") {
      logger.warn("campaign auto-paused mid-tick (quota) — stopping further sends");
    }
  } catch (err) {
    logger.error({ err, queueId: item.id }, "send job threw — marking queue item DONE");
    await deps.markQueue(item.id, "DONE");
  }
}
