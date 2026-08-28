/**
 * Generates `count` human-like send times spread across the daily sending
 * window [startHour, endHour) on `baseDate`.
 *
 * If `baseDate` is currently within the sending window, scheduling starts
 * immediately from `baseDate` (with the first email scheduled right away within 1 minute),
 * and subsequent emails evenly distributed across the remainder of the day.
 */
export function generateSendTimes(
  count: number,
  startHour: number,
  endHour: number,
  baseDate: Date,
  rand: () => number = Math.random,
): Date[] {
  if (count <= 0) return [];
  if (endHour <= startHour) return [];

  const dayStart = new Date(baseDate);
  dayStart.setHours(startHour, 0, 0, 0);

  const dayEnd = new Date(baseDate);
  dayEnd.setHours(endHour, 0, 0, 0);

  // If baseDate is already within the sending window, start from now so emails start immediately.
  const effectiveStartMs = Math.max(dayStart.getTime(), baseDate.getTime());
  const remainingMs = dayEnd.getTime() - effectiveStartMs;

  if (remainingMs <= 0) {
    // If generated after endHour, schedule with a 1-minute interval
    return Array.from({ length: count }, (_, i) => new Date(baseDate.getTime() + (i + 1) * 60_000));
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
    times.push(new Date(t));
    lastMs = t;
  }

  return times;
}
