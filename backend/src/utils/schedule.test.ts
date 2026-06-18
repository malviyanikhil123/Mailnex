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
});
