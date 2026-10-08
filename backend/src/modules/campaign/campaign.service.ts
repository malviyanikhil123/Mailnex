import { campaignRepo, type CampaignRepo, type Campaign } from "./campaign.repo.js";
import { generateDailyQueue, type GenerateQueueDeps } from "../../jobs/generate-queue.js";
import { contactsRepo } from "../contacts/contacts.repo.js";
import { templatesRepo } from "../templates/templates.repo.js";
import { sendersRepo } from "../senders/senders.repo.js";
import { sendersService } from "../senders/senders.service.js";
import type { CreateCampaignInput, UpdateCampaignInput } from "./campaign.schema.js";

export interface CampaignView extends Campaign {
  importName: string | null;
  templateIds: number[];
  quotaToday: number;
  nextScheduledAt: Date | null;
  countsByStatus: Record<string, number>;
}

/** Ownership checks and sender limits, injected so the service is unit-testable. */
export interface CampaignLookups {
  importExists(userId: number, importId: number): Promise<boolean>;
  templatesOwned(userId: number, templateIds: number[]): Promise<boolean>;
  senderExists(userId: number, senderAccountId: number): Promise<boolean>;
  /** Daily cap of the sending account, or null when it is not usable (missing creds / inactive). */
  senderDailyLimit(userId: number, senderAccountId: number | null): Promise<number | null>;
}

export const campaignLookups: CampaignLookups = {
  importExists: async (userId, importId) => !!(await contactsRepo.getImport(userId, importId)),
  templatesOwned: async (userId, ids) =>
    (await Promise.all(ids.map((id) => templatesRepo.getById(userId, id)))).every(Boolean),
  senderExists: async (userId, id) => !!(await sendersRepo.get(userId, id)),
  senderDailyLimit: async (userId, id) => (await sendersService.getCreds(userId, id))?.dailyLimit ?? null,
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
    const rows = await this.repo.list(userId);
    return Promise.all(rows.map((c) => this.withStats(c, c.importName, c.templateIds, now)));
  }

  async get(userId: number, id: number, now: Date = new Date()): Promise<CampaignView> {
    const c = await this.mustGet(userId, id);
    const [all] = (await this.repo.list(userId)).filter((r) => r.id === id);
    return this.withStats(c, all?.importName ?? null, all?.templateIds ?? [], now);
  }

  async create(userId: number, input: CreateCampaignInput): Promise<CampaignView> {
    await this.checkRefs(userId, input);
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

  private async assertStartable(c: Campaign): Promise<void> {
    if (c.importId == null) throw httpError(400, "Pick an import before starting the campaign");
    const templates = (await this.repo.templateIdsFor([c.id])).get(c.id) ?? [];
    if (templates.length === 0) throw httpError(400, "Pick at least one template before starting the campaign");
    if (c.mode === "TEST" && !c.testEmail) throw httpError(400, "TEST mode needs a test email");
    if (c.mode !== "DRAFT" && (await this.lookups.senderDailyLimit(c.userId, c.senderAccountId)) == null) {
      throw httpError(400, "The sender account is not configured or is inactive");
    }
    // Contact send status lives on the contact, so two live campaigns over one import
    // would race for the same people.
    const clash = await this.repo.activeCampaignForImport(c.userId, c.importId, c.id);
    if (clash) throw httpError(409, `"${clash.name}" is already running on this import — stop it first`);
  }

  private async withStats(c: Campaign, importName: string | null, templateIds: number[], now: Date): Promise<CampaignView> {
    const [quotaToday, nextScheduledAt, countsByStatus] = await Promise.all([
      this.repo.sentToday(c.id, now),
      this.repo.nextScheduledAt(c.id),
      this.repo.countByStatus(c),
    ]);
    return { ...c, importName, templateIds, quotaToday, nextScheduledAt, countsByStatus };
  }
}

export const campaignService = new CampaignService();
