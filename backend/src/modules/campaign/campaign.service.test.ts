import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignService } from "./campaign.service.js";
import type { CampaignRepo } from "./campaign.repo.js";

function makeRepo(over?: { state?: string; mode?: string }) {
  const settings = {
    id: 1,
    userId: 1,
    state: over?.state ?? "IDLE",
    mode: over?.mode ?? "DRAFT",
    dailyLimit: 50,
    startHour: 9,
    endHour: 18,
    testEmail: null,
    enabled: false,
    updatedAt: new Date(),
  };
  return {
    getSettings: vi.fn(async () => settings),
    setState: vi.fn(async (_userId: number, s: string) => { settings.state = s; return settings; }),
    setMode: vi.fn(async (_userId: number, m: string) => { settings.mode = m; return settings; }),
    updateSettings: vi.fn(async () => settings),
    enqueue: vi.fn(async () => 0),
    dueQueueItems: vi.fn(async () => []),
    markQueue: vi.fn(async () => {}),
    clearScheduledQueue: vi.fn(async () => {}),
    countScheduledForDay: vi.fn(async () => 1),
    nextScheduledAt: vi.fn(async () => null),
    selectableContacts: vi.fn(async () => []),
    getQuota: vi.fn(async () => 3),
    incQuota: vi.fn(async () => 4),
    countByStatus: vi.fn(async () => ({ PENDING: 10, SENT: 2 })),
  } as unknown as CampaignRepo & Record<string, ReturnType<typeof vi.fn>>;
}

describe("CampaignService", () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: CampaignService;
  const userId = 1;

  beforeEach(() => {
    repo = makeRepo();
    service = new CampaignService(repo);
  });

  it("start sets state RUNNING and returns status", async () => {
    const status = await service.start(userId);
    expect(repo.setState).toHaveBeenCalledWith(userId, "RUNNING");
    expect(status.state).toBe("RUNNING");
    expect(status.quotaToday).toBe(3);
    expect(status.dailyLimit).toBe(50);
  });

  it("pause sets state PAUSED", async () => {
    const status = await service.pause(userId);
    expect(repo.setState).toHaveBeenCalledWith(userId, "PAUSED");
    expect(status.state).toBe("PAUSED");
  });

  it("stop sets STOPPED and clears the scheduled queue", async () => {
    const status = await service.stop(userId);
    expect(repo.setState).toHaveBeenCalledWith(userId, "STOPPED");
    expect(repo.clearScheduledQueue).toHaveBeenCalledWith(userId);
    expect(status.state).toBe("STOPPED");
  });

  it("setMode persists the mode", async () => {
    const status = await service.setMode(userId, "LIVE");
    expect(repo.setMode).toHaveBeenCalledWith(userId, "LIVE");
    expect(status.mode).toBe("LIVE");
  });

  it("status aggregates quota, counts and next scheduled time", async () => {
    const status = await service.status(userId);
    expect(status.countsByStatus).toEqual({ PENDING: 10, SENT: 2 });
    expect(status.nextScheduledAt).toBeNull();
  });
});
