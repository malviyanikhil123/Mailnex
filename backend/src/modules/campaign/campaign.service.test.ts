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
    aiProvider: null,
    aiModel: null,
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
    // Only OpenAI is configured, with a custom saved model on top of the curated ones.
    aiProviderModels: async (_userId, provider) => (provider === "openai" ? ["gpt-5.4-mini", "gpt-5.5", "ft:gpt-custom"] : null),
    aiProvidersConfigured: async () => ["openai"],
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
      aiEnabled: false, aiInstructions: null, aiProvider: null, aiModel: null,
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
        aiProvider: null, aiModel: null,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  describe("AI provider and model", () => {
    const base = {
      name: "AI", importId: 10, senderAccountId: null, templateIds: [], mode: "DRAFT" as const, dailyLimit: 10,
      startHour: 9, endHour: 18, testEmail: null, language: "English", aiEnabled: true, aiInstructions: null,
    };

    it("create accepts a configured provider with one of its models", async () => {
      await service.create(userId, { ...base, aiProvider: "openai", aiModel: "gpt-5.5" });
      expect(repo.create).toHaveBeenCalledWith(userId, expect.objectContaining({ aiProvider: "openai", aiModel: "gpt-5.5" }));
    });

    it("create accepts the provider's saved custom model", async () => {
      await service.create(userId, { ...base, aiProvider: "openai", aiModel: "ft:gpt-custom" });
      expect(repo.create).toHaveBeenCalled();
    });

    it("create accepts null provider and model (the user's default)", async () => {
      await service.create(userId, { ...base, aiProvider: null, aiModel: null });
      expect(repo.create).toHaveBeenCalledWith(userId, expect.objectContaining({ aiProvider: null, aiModel: null }));
    });

    it("create rejects a provider the user has not configured", async () => {
      await expect(service.create(userId, { ...base, aiProvider: "anthropic", aiModel: null }))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not configured/) });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("create rejects a model the provider does not offer", async () => {
      await expect(service.create(userId, { ...base, aiProvider: "openai", aiModel: "claude-opus-5-5" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it("create rejects a model without a provider", async () => {
      await expect(service.create(userId, { ...base, aiProvider: null, aiModel: "gpt-5.5" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it("update checks a model against the stored provider", async () => {
      campaign.aiProvider = "openai";
      await service.update(userId, campaign.id, { aiModel: "gpt-5.5" });
      expect(repo.update).toHaveBeenCalledWith(userId, campaign.id, expect.objectContaining({ aiModel: "gpt-5.5" }));
      await expect(service.update(userId, campaign.id, { aiModel: "llama-3.3-70b-versatile" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it("update rejects switching to an unconfigured provider", async () => {
      await expect(service.update(userId, campaign.id, { aiProvider: "groq" })).rejects.toMatchObject({ statusCode: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("update drops the old provider's model when only the provider changes", async () => {
      campaign.aiProvider = "openai";
      campaign.aiModel = "gpt-5.5";
      await service.update(userId, campaign.id, { aiProvider: null });
      expect(repo.update).toHaveBeenCalledWith(userId, campaign.id, expect.objectContaining({ aiProvider: null, aiModel: null }));
    });

    it("update does not re-check an unchanged provider and model", async () => {
      // Saved with a custom model the provider no longer lists (changed in Settings since).
      campaign.aiProvider = "openai";
      campaign.aiModel = "ft:gpt-old";
      const lookups = makeLookups();
      const spy = vi.fn(lookups.aiProviderModels);
      service = new CampaignService(repo, { ...lookups, aiProviderModels: spy });
      await service.update(userId, campaign.id, { name: "Renamed", aiProvider: "openai", aiModel: "ft:gpt-old" });
      expect(spy).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(userId, campaign.id, expect.objectContaining({ name: "Renamed" }));
      // Changing the model still validates it.
      await expect(service.update(userId, campaign.id, { aiProvider: "openai", aiModel: "ft:gpt-other" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it("update leaves AI settings alone when they are not part of the patch", async () => {
      const lookups = makeLookups();
      const spy = vi.fn(lookups.aiProviderModels);
      service = new CampaignService(repo, { ...lookups, aiProviderModels: spy });
      await service.update(userId, campaign.id, { name: "Renamed" });
      expect(spy).not.toHaveBeenCalled();
    });
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

  describe("start needs a usable sender in every mode", () => {
    it("refuses a DRAFT campaign on the primary Gmail when none is set up", async () => {
      service = new CampaignService(repo, makeLookups({ senderDailyLimit: async () => null }));
      await expect(service.start(userId, campaign.id)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/primary Gmail, which is not set up/),
      });
      expect(repo.setState).not.toHaveBeenCalled();
    });

    it("refuses when the chosen sender account no longer exists", async () => {
      campaign.senderAccountId = 7;
      service = new CampaignService(repo, makeLookups({ senderDailyLimit: async () => null, senderExists: async () => false }));
      await expect(service.start(userId, campaign.id)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/no longer exists/),
      });
    });

    it("refuses when the chosen sender account is turned off", async () => {
      campaign.senderAccountId = 7;
      service = new CampaignService(repo, makeLookups({ senderDailyLimit: async () => null }));
      await expect(service.start(userId, campaign.id)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/turned off/),
      });
    });

    it("resume checks the sender too", async () => {
      campaign.state = "PAUSED";
      service = new CampaignService(repo, makeLookups({ senderDailyLimit: async () => null }));
      await expect(service.resume(userId, campaign.id)).rejects.toMatchObject({ statusCode: 400 });
      expect(campaign.state).toBe("PAUSED");
    });
  });

  describe("aiActive", () => {
    it("is true when AI is on and the user has a key for the default provider", async () => {
      expect((await service.get(userId, campaign.id)).aiActive).toBe(true);
    });

    it("is false when the user has no AI key at all", async () => {
      service = new CampaignService(repo, makeLookups({ aiProvidersConfigured: async () => [] }));
      expect((await service.get(userId, campaign.id)).aiActive).toBe(false);
      expect((await service.list(userId))[0].aiActive).toBe(false);
    });

    it("is false when AI is off for the campaign", async () => {
      campaign.aiEnabled = false;
      expect((await service.get(userId, campaign.id)).aiActive).toBe(false);
    });

    it("follows the campaign's own provider when one is picked", async () => {
      campaign.aiProvider = "anthropic";
      expect((await service.get(userId, campaign.id)).aiActive).toBe(false);
      campaign.aiProvider = "openai";
      expect((await service.list(userId))[0].aiActive).toBe(true);
    });
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
