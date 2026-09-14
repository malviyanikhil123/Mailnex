import { getZonedWindow } from "./timezone.js";

/**
 * Generates `count` human-like send times spread across the daily sending
 * window [startHour, endHour) on `baseDate`.
 *
 * If `timeZone` is provided, computes window bounds in that timezone.
 * If `baseDate` is currently within the sending window, scheduling starts
 * immediately from `baseDate` (with the first email scheduled right away within 1 minute),
 * and subsequent emails evenly distributed across the remainder of the window.
 *
 * If `baseDate` is past `endHour`, returns [] so no emails are sent outside the window.
 */
export function generateSendTimes(
  count: number,
  startHour: number,
  endHour: number,
  baseDate: Date,
  rand: () => number = Math.random,
  timeZone?: string,
): Date[] {
  if (count <= 0) return [];
  if (endHour <= startHour) return [];

  let dayStart: Date;
  let dayEnd: Date;

  if (timeZone) {
    const window = getZonedWindow(baseDate, timeZone, startHour, endHour);
    dayStart = window.windowStart;
    dayEnd = window.windowEnd;
  } else {
    dayStart = new Date(baseDate);
    dayStart.setHours(startHour, 0, 0, 0);

    dayEnd = new Date(baseDate);
    dayEnd.setHours(endHour, 0, 0, 0);
  }

  // If baseDate is already within the sending window, start from now so emails start immediately.
  const effectiveStartMs = Math.max(dayStart.getTime(), baseDate.getTime());
  const remainingMs = dayEnd.getTime() - effectiveStartMs;

  if (remainingMs <= 0) {
    // Past endHour for today: do NOT schedule any emails.
    return [];
  }

  const bucketMs = remainingMs / count;
  const times: Date[] = [];
  let lastMs = effectiveStartMs - 1;

  for (let i = 0; i < count; i++) {
    const bucketStart = effectiveStartMs + i * bucketMs;
    // For the very first email, schedule it immediately (within 0 to 60s)
    let t =
      i === 0
        ? effectiveStartMs + Math.floor(rand() * Math.min(60_000, Math.max(10_000, bucketMs)))
        : Math.floor(bucketStart + rand() * bucketMs);

    if (t <= lastMs) t = lastMs + 1000;
    if (t >= dayEnd.getTime()) {
      t = dayEnd.getTime() - 1000;
    }
    times.push(new Date(t));
    lastMs = t;
  }

  return times;
}
