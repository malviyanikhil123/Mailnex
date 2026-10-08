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
  dueQueueItems(now: Date, limit: number): Promise<{ id: number; contactId: number; scheduledAt?: Date }[]>;
  markQueue(id: number, status: "PROCESSING" | "DONE" | "CANCELLED" | "SCHEDULED"): Promise<void>;
  runSendJob(contactId: number): Promise<{ outcome: SendOutcome }>;
}

/** One scheduler tick for one sending account (runs every minute). Every RUNNING
 *  campaign that sends from the account and is inside its window gets today's queue
 *  built, then AT MOST ONE due email is sent across all of them — the earliest
 *  scheduled — so campaigns sharing a Gmail never send in bulk or simultaneously. */
export async function senderTick(campaigns: CampaignTickDeps[], now: Date): Promise<void> {
  let next: { deps: CampaignTickDeps; item: { id: number; contactId: number; scheduledAt?: Date } } | null = null;

  for (const deps of campaigns) {
    const settings = await deps.getTickSettings();
    if (!settings || settings.state !== "RUNNING") continue;

    const hour = now.getHours();
    if (hour < settings.startHour || hour >= settings.endHour) continue;

    // Ensure today's queue exists (idempotent).
    await generateDailyQueue(deps, now);

    const [item] = await deps.dueQueueItems(now, 1);
    if (!item) continue;
    if (!next || (item.scheduledAt && next.item.scheduledAt && item.scheduledAt < next.item.scheduledAt)) {
      next = { deps, item };
    }
  }

  if (!next) return;

  const { deps, item } = next;
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

/** Tick for a single campaign with its own sending account. */
export function campaignTick(deps: CampaignTickDeps, now: Date): Promise<void> {
  return senderTick([deps], now);
}
