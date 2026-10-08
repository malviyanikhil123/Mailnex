import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignService, type CampaignLookups } from "./campaign.service.js";
import type { CampaignRepo, Campaign } from "./campaign.repo.js";

function makeCampaign(over?: Partial<Campaign>): Campaign {
  return {
    id: 5,
    userId: 1,
    name: "Promo",
    importId: 10,
    senderAccountId: null,
    mode: "DRAFT",
    state: "IDLE",
    dailyLimit: 50,
    startHour: 9,
    endHour: 18,
    testEmail: null,
    language: "English",
    aiEnabled: true,
    aiInstructions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function makeRepo(campaign: Campaign, opts?: { templateIds?: number[]; clash?: Campaign | null }) {
  const templateIds = opts?.templateIds ?? [3, 4];
  return {
    get: vi.fn(async (_userId: number, id: number) => (id === campaign.id ? campaign : null)),
    getById: vi.fn(async () => campaign),
    list: vi.fn(async () => [{ ...campaign, importName: "Follow-ups", templateIds }]),
    create: vi.fn(async (_userId: number, values: Partial<Campaign>) => Object.assign(campaign, values)),
    update: vi.fn(async (_userId: number, _id: number, patch: Partial<Campaign>) => Object.assign(campaign, patch)),
    remove: vi.fn(async () => true),
    setState: vi.fn(async (_id: number, s: Campaign["state"]) => { campaign.state = s; }),
    setTemplates: vi.fn(async () => {}),
    templateIdsFor: vi.fn(async () => new Map([[campaign.id, templateIds]])),
    activeCampaignForImport: vi.fn(async () => opts?.clash ?? null),
    clearScheduledQueue: vi.fn(async () => {}),
    countScheduledForDay: vi.fn(async () => 1),
    nextScheduledAt: vi.fn(async () => null),
    sentToday: vi.fn(async () => 3),
    senderUsageToday: vi.fn(async () => 0),
    selectableContacts: vi.fn(async () => []),
    enqueue: vi.fn(async () => 0),
    countByStatus: vi.fn(async () => ({ PENDING: 10, SENT: 2 })),
  } as unknown as CampaignRepo & Record<string, ReturnType<typeof vi.fn>>;
}

function makeLookups(over?: Partial<CampaignLookups>): CampaignLookups {
  return {
    importExists: async () => true,
    templatesOwned: async () => true,
    senderExists: async () => true,
    senderDailyLimit: async () => 100,
    ...over,
  };
}

describe("CampaignService", () => {
  const userId = 1;
  let campaign: Campaign;
  let repo: ReturnType<typeof makeRepo>;
  let service: CampaignService;

  beforeEach(() => {
    campaign = makeCampaign();
    repo = makeRepo(campaign);
    service = new CampaignService(repo, makeLookups());
  });

  it("create stores the campaign and its template rotation", async () => {
    const view = await service.create(userId, {
      name: "Promo", importId: 10, senderAccountId: null, templateIds: [3, 4], mode: "DRAFT",
      dailyLimit: 20, startHour: 9, endHour: 18, testEmail: null, language: "Hindi",
      aiEnabled: false, aiInstructions: null,
    });
    expect(repo.create).toHaveBeenCalledWith(userId, expect.objectContaining({ name: "Promo", language: "Hindi", aiEnabled: false }));
    expect(repo.setTemplates).toHaveBeenCalledWith(campaign.id, [3, 4]);
    expect(view.templateIds).toEqual([3, 4]);
    expect(view.importName).toBe("Follow-ups");
  });

  it("create rejects an import that does not belong to the user", async () => {
    service = new CampaignService(repo, makeLookups({ importExists: async () => false }));
    await expect(
      service.create(userId, {
        name: "X", importId: 99, senderAccountId: null, templateIds: [], mode: "DRAFT", dailyLimit: 1,
        startHour: 9, endHour: 18, testEmail: null, language: "English", aiEnabled: true, aiInstructions: null,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("start sets RUNNING and returns per-campaign stats", async () => {
    const view = await service.start(userId, campaign.id);
    expect(repo.setState).toHaveBeenCalledWith(campaign.id, "RUNNING");
    expect(view.state).toBe("RUNNING");
    expect(view.quotaToday).toBe(3);
    expect(view.countsByStatus).toEqual({ PENDING: 10, SENT: 2 });
  });

  it("start refuses a campaign without templates", async () => {
    repo = makeRepo(campaign, { templateIds: [] });
    service = new CampaignService(repo, makeLookups());
    await expect(service.start(userId, campaign.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.setState).not.toHaveBeenCalled();
  });

  it("start refuses when another campaign is already running on the same import", async () => {
    repo = makeRepo(campaign, { clash: makeCampaign({ id: 6, name: "Other", state: "RUNNING" }) });
    service = new CampaignService(repo, makeLookups());
    await expect(service.start(userId, campaign.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("start refuses LIVE mode when the sender has no usable credentials", async () => {
    campaign.mode = "LIVE";
    service = new CampaignService(repo, makeLookups({ senderDailyLimit: async () => null }));
    await expect(service.start(userId, campaign.id)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("pause sets PAUSED", async () => {
    const view = await service.pause(userId, campaign.id);
    expect(repo.setState).toHaveBeenCalledWith(campaign.id, "PAUSED");
    expect(view.state).toBe("PAUSED");
  });

  it("stop sets STOPPED and clears only this campaign's queue", async () => {
    const view = await service.stop(userId, campaign.id);
    expect(repo.setState).toHaveBeenCalledWith(campaign.id, "STOPPED");
    expect(repo.clearScheduledQueue).toHaveBeenCalledWith(campaign.id);
    expect(view.state).toBe("STOPPED");
  });

  it("update refuses to switch the import of a running campaign", async () => {
    campaign.state = "RUNNING";
    await expect(service.update(userId, campaign.id, { importId: 11 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 404 for a campaign of another user", async () => {
    await expect(service.pause(userId, 999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
