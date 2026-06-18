import { generateSendTimes } from "../utils/schedule.js";
import { logger } from "../utils/logger.js";

export interface QueueGenSettings {
  state: string;
  dailyLimit: number;
  startHour: number;
  endHour: number;
}

export interface GenerateQueueDeps {
  getSettings(): Promise<QueueGenSettings | null>;
  getQuota(date: Date): Promise<number>;
  countScheduledForDay(dayStart: Date): Promise<number>;
  selectableContacts(limit: number, now: Date): Promise<{ id: number }[]>;
  enqueue(rows: { contactId: number; scheduledAt: Date }[]): Promise<number>;
  rand?: () => number;
}

/** Build today's send queue if the campaign is RUNNING and today's queue is
 *  empty. Enqueues min(remainingQuota, selectableContacts) rows at human-like
 *  times within the window. Idempotent for the day (no-op if rows already exist).
 *  Returns the number of rows enqueued. */
export async function generateDailyQueue(deps: GenerateQueueDeps, now: Date): Promise<number> {
  const settings = await deps.getSettings();
  if (!settings || settings.state !== "RUNNING") return 0;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const alreadyScheduled = await deps.countScheduledForDay(dayStart);
  if (alreadyScheduled > 0) return 0;

  const quotaToday = await deps.getQuota(now);
  const remaining = settings.dailyLimit - quotaToday;
  if (remaining <= 0) return 0;

  const selectable = await deps.selectableContacts(remaining, now);
  if (selectable.length === 0) return 0;

  const times = generateSendTimes(
    selectable.length,
    settings.startHour,
    settings.endHour,
    now,
    deps.rand,
  );

  const rows = selectable.map((c, i) => ({ contactId: c.id, scheduledAt: times[i] }));
  const enqueued = await deps.enqueue(rows);
  logger.info({ enqueued, date: dayStart.toISOString().slice(0, 10) }, "daily queue generated");
  return enqueued;
}
