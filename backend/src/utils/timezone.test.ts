import { describe, it, expect } from "vitest";
import { getHourInTimezone, getZonedWindow, isValidTimezone, getDateKeyInTimezone } from "./timezone.js";

describe("timezone utilities", () => {
  it("validates timezones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Invalid/Zone")).toBe(false);
  });

  it("extracts correct hour in Asia/Kolkata when UTC is 14:30 (should be 20:00 IST)", () => {
    const utcDate = new Date("2026-09-14T14:30:00.000Z");
    const kolkataHour = getHourInTimezone(utcDate, "Asia/Kolkata");
    expect(kolkataHour).toBe(20);

    const utcHour = getHourInTimezone(utcDate, "UTC");
    expect(utcHour).toBe(14);
  });

  it("extracts correct date key in Asia/Kolkata", () => {
    // 20:00 UTC on 2026-09-14 is 01:30 AM on 2026-09-15 in Kolkata
    const d = new Date("2026-09-14T20:00:00.000Z");
    expect(getDateKeyInTimezone(d, "UTC")).toBe("2026-09-14");
    expect(getDateKeyInTimezone(d, "Asia/Kolkata")).toBe("2026-09-15");
  });

  it("calculates correct windowStart and windowEnd for Asia/Kolkata", () => {
    const nowInKolkata = new Date("2026-09-14T06:00:00.000Z"); // 11:30 AM IST on Sep 14
    const { windowStart, windowEnd } = getZonedWindow(nowInKolkata, "Asia/Kolkata", 9, 18);

    // 09:00 IST is 03:30 UTC
    expect(windowStart.toISOString()).toBe("2026-09-14T03:30:00.000Z");
    // 18:00 IST is 12:30 UTC
    expect(windowEnd.toISOString()).toBe("2026-09-14T12:30:00.000Z");

    // Check that 11:30 AM IST (06:00 UTC) is inside the window
    expect(nowInKolkata >= windowStart && nowInKolkata < windowEnd).toBe(true);

    // Check that 20:30 IST (15:00 UTC) is outside the window
    const eveningInKolkata = new Date("2026-09-14T15:00:00.000Z");
    expect(eveningInKolkata < windowEnd).toBe(false);
  });
});
