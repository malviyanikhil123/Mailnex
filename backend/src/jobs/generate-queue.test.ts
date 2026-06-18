import { describe, it, expect, vi } from "vitest";
import { generateDailyQueue, type GenerateQueueDeps } from "./generate-queue.js";

const NOW = new Date(2026, 5, 18, 9, 30, 0, 0);

function makeDeps(over?: Partial<{
  state: string;
  dailyLimit: number;
  quota: number;
  alreadyScheduled: number;
  selectable: number;
}>): { deps: GenerateQueueDeps; enqueue: ReturnType<typeof vi.fn> } {
  const enqueue = vi.fn(async (rows: { contactId: number; scheduledAt: Date }[]) => rows.length);
  const selectableCount = over?.selectable ?? 5;
  const deps: GenerateQueueDeps = {
    getSettings: async () => ({
      state: over?.state ?? "RUNNING",
      dailyLimit: over?.dailyLimit ?? 50,
      startHour: 9,
      endHour: 18,
    }),
    getQuota: async () => over?.quota ?? 0,
    countScheduledForDay: async () => over?.alreadyScheduled ?? 0,
    selectableContacts: async (limit) =>
      Array.from({ length: Math.min(limit, selectableCount) }, (_, i) => ({ id: i + 1 })),
    enqueue,
    rand: () => 0.5,
  };
  return { deps, enqueue };
}

describe("generateDailyQueue", () => {
  it("does nothing when not RUNNING", async () => {
    const { deps, enqueue } = makeDeps({ state: "IDLE" });
    expect(await generateDailyQueue(deps, NOW)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does nothing when today's queue already has scheduled rows", async () => {
    const { deps, enqueue } = makeDeps({ alreadyScheduled: 12 });
    expect(await generateDailyQueue(deps, NOW)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does nothing when the daily quota is already used up", async () => {
    const { deps, enqueue } = makeDeps({ dailyLimit: 50, quota: 50 });
    expect(await generateDailyQueue(deps, NOW)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues min(remainingQuota, selectableContacts)", async () => {
    // remaining = 50 - 47 = 3, selectable = 5 → expect 3
    const { deps, enqueue } = makeDeps({ dailyLimit: 50, quota: 47, selectable: 5 });
    const n = await generateDailyQueue(deps, NOW);
    expect(n).toBe(3);
    expect(enqueue.mock.calls[0][0]).toHaveLength(3);
  });

  it("enqueues all selectable when quota allows more", async () => {
    const { deps, enqueue } = makeDeps({ dailyLimit: 50, quota: 0, selectable: 5 });
    expect(await generateDailyQueue(deps, NOW)).toBe(5);
    expect(enqueue.mock.calls[0][0]).toHaveLength(5);
  });
});
