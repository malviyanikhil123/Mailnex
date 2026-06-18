import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignService } from "./campaign.service.js";
import type { CampaignRepo } from "./campaign.repo.js";

function makeRepo(over?: { state?: string; mode?: string }) {
  const settings = {
    id: 1,
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
    setState: vi.fn(async (s: string) => { settings.state = s; return settings; }),
    setMode: vi.fn(async (m: string) => { settings.mode = m; return settings; }),
    updateSettings: vi.fn(async () => settings),
    enqueue: vi.fn(async () => 0),
    dueQueueItems: vi.fn(async () => []),
    markQueue: vi.fn(async () => {}),
    clearScheduledQueue: vi.fn(async () => {}),
    countScheduledForDay: vi.fn(async () => 1), // queue already present → no generation
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

  beforeEach(() => {
    repo = makeRepo();
    service = new CampaignService(repo);
  });

  it("start sets state RUNNING and returns status", async () => {
    const status = await service.start();
    expect(repo.setState).toHaveBeenCalledWith("RUNNING");
    expect(status.state).toBe("RUNNING");
    expect(status.quotaToday).toBe(3);
    expect(status.dailyLimit).toBe(50);
  });

  it("pause sets state PAUSED", async () => {
    const status = await service.pause();
    expect(repo.setState).toHaveBeenCalledWith("PAUSED");
    expect(status.state).toBe("PAUSED");
  });

  it("stop sets STOPPED and clears the scheduled queue", async () => {
    const status = await service.stop();
    expect(repo.setState).toHaveBeenCalledWith("STOPPED");
    expect(repo.clearScheduledQueue).toHaveBeenCalled();
    expect(status.state).toBe("STOPPED");
  });

  it("setMode persists the mode", async () => {
    const status = await service.setMode("LIVE");
    expect(repo.setMode).toHaveBeenCalledWith("LIVE");
    expect(status.mode).toBe("LIVE");
  });

  it("status aggregates quota, counts and next scheduled time", async () => {
    const status = await service.status();
    expect(status.countsByStatus).toEqual({ PENDING: 10, SENT: 2 });
    expect(status.nextScheduledAt).toBeNull();
  });
});
