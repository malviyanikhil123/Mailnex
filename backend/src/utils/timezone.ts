/**
 * Timezone utilities for schedule and window calculations.
 */

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current hour (0-23) of `date` in the given `timeZone`.
 * Defaults to "Asia/Kolkata" if invalid or not provided.
 */
export function getHourInTimezone(date: Date, timeZone = "Asia/Kolkata"): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    if (!hourPart) return date.getHours();
    const val = parseInt(hourPart.value, 10);
    return val === 24 ? 0 : val;
  } catch {
    return date.getHours();
  }
}

/**
 * Returns the YYYY-MM-DD string of `date` in the given `timeZone`.
 */
export function getDateKeyInTimezone(date: Date, timeZone = "Asia/Kolkata"): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Computes the exact UTC Date objects corresponding to startHour:00 and endHour:00
 * in the specified timeZone for the day of `baseDate`.
 */
export function getZonedWindow(
  baseDate: Date,
  timeZone = "Asia/Kolkata",
  startHour: number,
  endHour: number,
): { windowStart: Date; windowEnd: Date } {
  const dateStr = getDateKeyInTimezone(baseDate, timeZone);
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  function zonedDateTimeToUtc(targetHour: number): Date {
    const guessUtc = new Date(Date.UTC(year, month - 1, day, targetHour, 0, 0, 0));
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(guessUtc);
      const m: Record<string, string> = {};
      for (const p of parts) m[p.type] = p.value;
      const h = parseInt(m.hour, 10) % 24;
      const guessLocalMs = Date.UTC(
        parseInt(m.year, 10),
        parseInt(m.month, 10) - 1,
        parseInt(m.day, 10),
        h,
        parseInt(m.minute, 10),
        parseInt(m.second, 10),
      );
      const offsetMs = guessLocalMs - guessUtc.getTime();
      return new Date(guessUtc.getTime() - offsetMs);
    } catch {
      const fallback = new Date(baseDate);
      fallback.setHours(targetHour, 0, 0, 0);
      return fallback;
    }
  }

  return {
    windowStart: zonedDateTimeToUtc(startHour),
    windowEnd: zonedDateTimeToUtc(endHour),
  };
}
