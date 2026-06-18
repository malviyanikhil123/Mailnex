/**
 * Generates `count` human-like send times spread across the daily sending
 * window [startHour, endHour) on `baseDate`.
 *
 * The window is partitioned into `count` equal buckets; each send time is
 * placed at a random offset within its bucket (using the injectable `rand`
 * for deterministic tests). Times are strictly increasing and all fall within
 * the window, so no two sends collide and the cadence looks irregular/human.
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

  const windowMs = (endHour - startHour) * 3_600_000;
  const bucketMs = windowMs / count;

  const times: Date[] = [];
  let lastMs = dayStart.getTime() - 1;

  for (let i = 0; i < count; i++) {
    const bucketStart = dayStart.getTime() + i * bucketMs;
    let t = Math.floor(bucketStart + rand() * bucketMs);
    // enforce strictly increasing (guards against rand collisions / clamping)
    if (t <= lastMs) t = lastMs + 1000;
    times.push(new Date(t));
    lastMs = t;
  }

  return times;
}
