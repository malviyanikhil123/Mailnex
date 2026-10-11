import { campaignRepo, type CampaignRepo, type Campaign } from "./campaign.repo.js";
import { generateDailyQueue, type GenerateQueueDeps } from "../../jobs/generate-queue.js";
import { contactsRepo } from "../contacts/contacts.repo.js";
import { templatesRepo } from "../templates/templates.repo.js";
import { sendersRepo } from "../senders/senders.repo.js";
import { sendersService } from "../senders/senders.service.js";
import { aiProvidersService } from "../ai-providers/ai-providers.service.js";
import { PROVIDERS, isAiProvider } from "../../integrations/ai/providers.js";
import type { CreateCampaignInput, UpdateCampaignInput } from "./campaign.schema.js";

export interface CampaignView extends Campaign {
  importName: string | null;
  templateIds: number[];
  quotaToday: number;
  nextScheduledAt: Date | null;
  countsByStatus: Record<string, number>;
  /** True when sending will use AI: it is on for the campaign and the user has a key for
   *  its provider (or, with no provider picked, any key). Otherwise templates go out as written. */
  aiActive: boolean;
}

/** Ownership checks and sender limits, injected so the service is unit-testable. */
export interface CampaignLookups {
  importExists(userId: number, importId: number): Promise<boolean>;
  templatesOwned(userId: number, templateIds: number[]): Promise<boolean>;
  senderExists(userId: number, senderAccountId: number): Promise<boolean>;
  /** Daily cap of the sending account, or null when it is not usable (missing creds / inactive). */
  senderDailyLimit(userId: number, senderAccountId: number | null): Promise<number | null>;
  /** Models a campaign may use with this AI provider, or null when the user has no key for it. */
  aiProviderModels(userId: number, provider: string): Promise<string[] | null>;
  /** AI providers the user has saved a key for. */
  aiProvidersConfigured(userId: number): Promise<string[]>;
}

export const campaignLookups: CampaignLookups = {
  importExists: async (userId, importId) => !!(await contactsRepo.getImport(userId, importId)),
  templatesOwned: async (userId, ids) =>
    (await Promise.all(ids.map((id) => templatesRepo.getById(userId, id)))).every(Boolean),
  senderExists: async (userId, id) => !!(await sendersRepo.get(userId, id)),
  senderDailyLimit: async (userId, id) => (await sendersService.getCreds(userId, id))?.dailyLimit ?? null,
  aiProviderModels: (userId, provider) => aiProvidersService.allowedModels(userId, provider),
  aiProvidersConfigured: async (userId) =>
    (await aiProvidersService.list(userId)).filter((p) => p.configured).map((p) => p.provider),
};

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/** Builds generate-queue deps for one campaign. */
export function genDeps(campaign: Campaign, repo: CampaignRepo, lookups: CampaignLookups): GenerateQueueDeps {
  return {
    getSettings: async () => {
      const c = await repo.getById(campaign.id);
      return c ? { state: c.state, dailyLimit: c.dailyLimit, startHour: c.startHour, endHour: c.endHour } : null;
    },
    getQuota: (d) => repo.sentToday(campaign.id, d),
    countScheduledForDay: (d) => repo.countScheduledForDay(campaign.id, d),
    selectableContacts: (limit, now) => repo.selectableContacts(campaign, limit, now),
    enqueue: (rows) => repo.enqueue(campaign.userId, campaign.id, rows),
    senderRemaining: async (now) => {
      const limit = await lookups.senderDailyLimit(campaign.userId, campaign.senderAccountId);
      if (limit == null) return 0;
      return limit - (await repo.senderUsageToday(campaign.userId, campaign.senderAccountId, now, campaign.id));
    },
  };
}

export class CampaignService {
  constructor(
    private repo: CampaignRepo = campaignRepo,
    private lookups: CampaignLookups = campaignLookups,
  ) {}

  async list(userId: number, now: Date = new Date()): Promise<CampaignView[]> {
    const [rows, aiProviders] = await Promise.all([this.repo.list(userId), this.lookups.aiProvidersConfigured(userId)]);
    return Promise.all(rows.map((c) => this.withStats(c, c.importName, c.templateIds, aiProviders, now)));
  }

  async get(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    const c = await this.mustGet(userId, id);
    const [all] = (await this.repo.list(userId)).filter((r) => r.id === id);
    const aiProviders = await this.lookups.aiProvidersConfigured(userId);
    return this.withStats(c, all?.importName ?? null, all?.templateIds ?? [], aiProviders, now);
  }

  async create(userId: number, input: CreateCampaignInput): Promise<CampaignView> {
    await this.checkRefs(userId, input);
    await this.checkAi(userId, input.aiProvider, input.aiModel);
    const { templateIds, ...values } = input;
    const created = await this.repo.create(userId, values as Parameters<CampaignRepo["create"]>[1]);
    await this.repo.setTemplates(created.id, templateIds);
    return this.get(userId, created.id);
  }

  async update(userId: number, id: number, input: UpdateCampaignInput): Promise<CampaignView> {
    const existing = await this.mustGet(userId, id);
    if (input.importId !== undefined && input.importId !== existing.importId && existing.state !== "IDLE" && existing.state !== "STOPPED") {
      throw httpError(409, "Stop the campaign before switching it to a different import");
    }
    await this.checkRefs(userId, input);
    if (input.aiProvider !== undefined || input.aiModel !== undefined) {
      // Check the pair as it will be saved: a model alone keeps the stored provider, and
      // switching provider without naming a model drops the old provider's model.
      const provider = input.aiProvider !== undefined ? input.aiProvider : existing.aiProvider;
      if (input.aiModel === undefined && provider !== existing.aiProvider) input = { ...input, aiModel: null };
      const model = input.aiModel !== undefined ? input.aiModel : existing.aiModel;
      // The form re-sends the AI pair on every save. An unchanged pair was valid when it was
      // stored; re-checking it would block unrelated edits (e.g. a rename) once the user
      // changed that provider's custom model in Settings.
      if (provider !== existing.aiProvider || model !== existing.aiModel) {
        await this.checkAi(userId, provider, model);
      }
    }
    const { templateIds, ...patch } = input;
    await this.repo.update(userId, id, patch as Partial<Campaign>);
    if (templateIds) await this.repo.setTemplates(id, templateIds);
    return this.get(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    if (!(await this.repo.remove(userId, id))) throw httpError(404, `Campaign ${id} not found`);
  }

  /** Start: validate the campaign can actually send, mark RUNNING and build today's queue. */
  async start(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    const c = await this.mustGet(userId, id);
    await this.assertStartable(c);
    await this.repo.setState(id, "RUNNING");
    await generateDailyQueue(genDeps(c, this.repo, this.lookups), now);
    return this.get(userId, id, now);
  }

  async pause(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    await this.mustGet(userId, id);
    await this.repo.setState(id, "PAUSED");
    return this.get(userId, id, now);
  }

  async resume(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    return this.start(userId, id, now);
  }

  /** Stop: mark STOPPED and cancel all not-yet-sent queue rows. */
  async stop(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    await this.mustGet(userId, id);
    await this.repo.setState(id, "STOPPED");
    await this.repo.clearScheduledQueue(id);
    return this.get(userId, id, now);
  }

  // ---- helpers ---------------------------------------------------------------

  private async mustGet(userId: number, id: number): Promise<Campaign> {
    const c = await this.repo.get(userId, id);
    if (!c) throw httpError(404, `Campaign ${id} not found`);
    return c;
  }

  private async checkRefs(
    userId: number,
    input: { importId?: number | null; senderAccountId?: number | null; templateIds?: number[] },
  ): Promise<void> {
    if (input.importId != null && !(await this.lookups.importExists(userId, input.importId))) {
      throw httpError(400, "Import not found");
    }
    if (input.senderAccountId != null && !(await this.lookups.senderExists(userId, input.senderAccountId))) {
      throw httpError(400, "Sender account not found");
    }
    if (input.templateIds?.length && !(await this.lookups.templatesOwned(userId, input.templateIds))) {
      throw httpError(400, "One or more templates not found");
    }
  }

  /** The campaign's AI provider must be one the user has a key for, and its model one
   *  that provider offers (curated, or the provider's live-checked saved model). */
  private async checkAi(userId: number, provider: string | null, model: string | null): Promise<void> {
    if (provider == null) {
      if (model != null) throw httpError(400, "Pick an AI provider for the chosen model");
      return;
    }
    const label = isAiProvider(provider) ? PROVIDERS[provider].label : provider;
    const models = await this.lookups.aiProviderModels(userId, provider);
    if (!models) throw httpError(400, `${label} is not configured — add its API key in Settings first`);
    if (model != null && !models.includes(model)) {
      throw httpError(400, `"${model}" is not an available ${label} model`);
    }
  }

  private async assertStartable(c: Campaign): Promise<void> {
    if (c.importId == null) throw httpError(400, "Pick an import before starting the campaign");
    const templates = (await this.repo.templateIdsFor([c.id])).get(c.id) ?? [];
    if (templates.length === 0) throw httpError(400, "Pick at least one template before starting the campaign");
    if (c.mode === "TEST" && !c.testEmail) throw httpError(400, "TEST mode needs a test email");
    await this.assertSenderUsable(c);
    // Contact send status lives on the contact, so two live campaigns over one import
    // would race for the same people.
    const clash = await this.repo.activeCampaignForImport(c.userId, c.importId, c.id);
    if (clash) throw httpError(409, `"${clash.name}" is already running on this import — stop it first`);
  }

  /**
   * Every mode needs a usable sender: the daily queue is capped by what the sender has
   * left today, so even a DRAFT campaign without one would run and never generate.
   */
  private async assertSenderUsable(c: Campaign): Promise<void> {
    if ((await this.lookups.senderDailyLimit(c.userId, c.senderAccountId)) != null) return;
    if (c.senderAccountId == null) {
      throw httpError(400, "This campaign sends from your primary Gmail, which is not set up yet — add it in Settings or pick another sender");
    }
    if (!(await this.lookups.senderExists(c.userId, c.senderAccountId))) {
      throw httpError(400, "This campaign's sender account no longer exists — pick another sender");
    }
    throw httpError(400, "This campaign's sender account is turned off — turn it back on in Senders or pick another sender");
  }

  private async withStats(
    c: Campaign,
    importName: string | null,
    templateIds: number[],
    aiProviders: string[],
    now: Date,
  ): Promise<CampaignView> {
    const [quotaToday, nextScheduledAt, countsByStatus] = await Promise.all([
      this.repo.sentToday(c.id, now),
      this.repo.nextScheduledAt(c.id),
      this.repo.countByStatus(c),
    ]);
    const aiActive = c.aiEnabled && (c.aiProvider == null ? aiProviders.length > 0 : aiProviders.includes(c.aiProvider));
    return { ...c, importName, templateIds, quotaToday, nextScheduledAt, countsByStatus, aiActive };
  }
}

export const campaignService = new CampaignService();
