import { describe, it, expect, vi } from "vitest";
import { campaignTick, senderTick, type CampaignTickDeps } from "./tick.js";

const IN_WINDOW = new Date(2026, 5, 18, 10, 0, 0, 0); // 10:00, inside 9-18
const OUT_WINDOW = new Date(2026, 5, 18, 20, 0, 0, 0); // 20:00, outside

function makeDeps(over?: Partial<{
  state: string;
  due: { id: number; contactId: number }[];
  outcome: string;
}>): { deps: CampaignTickDeps; runSendJob: ReturnType<typeof vi.fn>; markQueue: ReturnType<typeof vi.fn> } {
  const runSendJob = vi.fn(async () => ({ outcome: (over?.outcome ?? "sent") as any }));
  const markQueue = vi.fn(async () => {});
  const deps: CampaignTickDeps = {
    getTickSettings: async () => ({ state: over?.state ?? "RUNNING", startHour: 9, endHour: 18 }),
    // generateDailyQueue deps — make it a no-op (queue already present)
    getSettings: async () => ({ state: over?.state ?? "RUNNING", dailyLimit: 50, startHour: 9, endHour: 18 }),
    getQuota: async () => 0,
    countScheduledForDay: async () => 1, // already generated → no enqueue
    selectableContacts: async () => [],
    enqueue: async () => 0,
    dueQueueItems: async () => over?.due ?? [{ id: 100, contactId: 7 }],
    markQueue,
    runSendJob,
  };
  return { deps, runSendJob, markQueue };
}

describe("campaignTick", () => {
  it("does nothing when state is not RUNNING", async () => {
    const { deps, runSendJob } = makeDeps({ state: "IDLE" });
    await campaignTick(deps, IN_WINDOW);
    expect(runSendJob).not.toHaveBeenCalled();
  });

  it("does nothing outside the sending window", async () => {
    const { deps, runSendJob } = makeDeps({ state: "RUNNING" });
    await campaignTick(deps, OUT_WINDOW);
    expect(runSendJob).not.toHaveBeenCalled();
  });

  it("processes exactly one due item: PROCESSING → send → DONE", async () => {
    const { deps, runSendJob, markQueue } = makeDeps();
    await campaignTick(deps, IN_WINDOW);
    expect(runSendJob).toHaveBeenCalledTimes(1);
    expect(runSendJob).toHaveBeenCalledWith(7);
    expect(markQueue).toHaveBeenNthCalledWith(1, 100, "PROCESSING");
    expect(markQueue).toHaveBeenNthCalledWith(2, 100, "DONE");
  });

  it("does nothing when no items are due", async () => {
    const { deps, runSendJob } = makeDeps({ due: [] });
    await campaignTick(deps, IN_WINDOW);
    expect(runSendJob).not.toHaveBeenCalled();
  });

  it("still marks the queue DONE when the send job pauses (quota)", async () => {
    const { deps, runSendJob, markQueue } = makeDeps({ outcome: "paused" });
    await campaignTick(deps, IN_WINDOW);
    expect(runSendJob).toHaveBeenCalledTimes(1);
    expect(markQueue).toHaveBeenNthCalledWith(2, 100, "DONE");
  });

  it("sends only the earliest due email across campaigns sharing a sender", async () => {
    const a = makeDeps({ due: [{ id: 1, contactId: 11, scheduledAt: new Date(2026, 5, 18, 9, 40) } as any] });
    const b = makeDeps({ due: [{ id: 2, contactId: 22, scheduledAt: new Date(2026, 5, 18, 9, 10) } as any] });
    await senderTick([a.deps, b.deps], IN_WINDOW);
    expect(b.runSendJob).toHaveBeenCalledWith(22);
    expect(a.runSendJob).not.toHaveBeenCalled();
  });

  it("skips campaigns that are not RUNNING when picking across a sender", async () => {
    const paused = makeDeps({ state: "PAUSED" });
    const running = makeDeps({ due: [{ id: 3, contactId: 33 }] });
    await senderTick([paused.deps, running.deps], IN_WINDOW);
    expect(paused.runSendJob).not.toHaveBeenCalled();
    expect(running.runSendJob).toHaveBeenCalledWith(33);
  });
});
