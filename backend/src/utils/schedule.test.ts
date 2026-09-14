import { describe, it, expect } from "vitest";
import { generateSendTimes } from "./schedule.js";

describe("generateSendTimes", () => {
  const baseDate = new Date(2026, 5, 18, 0, 0, 0, 0); // 2026-06-18 local

  it("returns exactly `count` times", () => {
    const times = generateSendTimes(10, 9, 18, baseDate, () => 0.5);
    expect(times).toHaveLength(10);
  });

  it("returns [] for count = 0", () => {
    expect(generateSendTimes(0, 9, 18, baseDate)).toEqual([]);
  });

  it("places all times within [startHour, endHour)", () => {
    const times = generateSendTimes(50, 9, 18, baseDate, () => 0.5);
    const startMs = new Date(baseDate).setHours(9, 0, 0, 0);
    const endMs = new Date(baseDate).setHours(18, 0, 0, 0);
    for (const t of times) {
      expect(t.getTime()).toBeGreaterThanOrEqual(startMs);
      expect(t.getTime()).toBeLessThan(endMs);
    }
  });

  it("produces strictly increasing times", () => {
    const times = generateSendTimes(50, 9, 18, baseDate, () => 0.5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  it("stays strictly increasing even with a degenerate rand", () => {
    const times = generateSendTimes(20, 9, 18, baseDate, () => 0); // all at bucket starts
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  it("returns [] when window is non-positive", () => {
    expect(generateSendTimes(5, 18, 9, baseDate)).toEqual([]);
  });

  it("returns [] when baseDate is after endHour", () => {
    // 20:00 (8 PM) is after 18:00
    const eveningDate = new Date(2026, 5, 18, 20, 0, 0, 0);
    expect(generateSendTimes(10, 9, 18, eveningDate)).toEqual([]);
  });

  it("generates send times respecting timeZone (e.g. Asia/Kolkata)", () => {
    // 04:00 UTC on Sep 14 is 09:30 AM IST (within the 9-18 window)
    const midDayIst = new Date("2026-09-14T04:00:00.000Z");
    const times = generateSendTimes(5, 9, 18, midDayIst, () => 0.5, "Asia/Kolkata");
    expect(times).toHaveLength(5);
    // 18:00 IST is 12:30 UTC
    const endMs = new Date("2026-09-14T12:30:00.000Z").getTime();
    for (const t of times) {
      expect(t.getTime()).toBeLessThan(endMs);
    }

    // 15:00 UTC on Sep 14 is 20:30 IST (after 18:00 IST) -> should return []
    const eveningIst = new Date("2026-09-14T15:00:00.000Z");
    expect(generateSendTimes(5, 9, 18, eveningIst, () => 0.5, "Asia/Kolkata")).toEqual([]);
  });
});
