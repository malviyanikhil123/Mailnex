import { campaignRepo, type CampaignRepo } from "./campaign.repo.js";
import { generateDailyQueue, type GenerateQueueDeps } from "../../jobs/generate-queue.js";

export interface CampaignStatus {
  state: string;
  mode: string;
  quotaToday: number;
  dailyLimit: number;
  nextScheduledAt: Date | null;
  countsByStatus: Record<string, number>;
}

/** Builds generate-queue deps from a campaign repo for a specific user. */
export function genDeps(userId: number, repo: CampaignRepo): GenerateQueueDeps {
  return {
    getSettings: async () => {
      const s = await repo.getSettings(userId);
      return s
        ? { state: s.state, dailyLimit: s.dailyLimit, startHour: s.startHour, endHour: s.endHour }
        : null;
    },
    getQuota: (d) => repo.getQuota(userId, d),
    countScheduledForDay: (d) => repo.countScheduledForDay(userId, d),
    selectableContacts: (limit, now) => repo.selectableContacts(userId, limit, now),
    enqueue: (rows) => repo.enqueue(userId, rows),
  };
}

export class CampaignService {
  constructor(private repo: CampaignRepo = campaignRepo) {}

  /** Start: mark RUNNING and build today's queue immediately. */
  async start(userId: number, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState(userId, "RUNNING");
    await generateDailyQueue(genDeps(userId, this.repo), now);
    return this.status(userId, now);
  }

  async pause(userId: number, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState(userId, "PAUSED");
    return this.status(userId, now);
  }

  async resume(userId: number, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState(userId, "RUNNING");
    await generateDailyQueue(genDeps(userId, this.repo), now);
    return this.status(userId, now);
  }

  /** Stop: mark STOPPED and cancel all not-yet-sent queue rows. */
  async stop(userId: number, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState(userId, "STOPPED");
    await this.repo.clearScheduledQueue(userId);
    return this.status(userId, now);
  }

  async setMode(userId: number, mode: string, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setMode(userId, mode as Parameters<CampaignRepo["setMode"]>[1]);
    return this.status(userId, now);
  }

  async status(userId: number, now: Date = new Date()): Promise<CampaignStatus> {
    const settings = await this.repo.getSettings(userId);
    const [quotaToday, nextScheduledAt, countsByStatus] = await Promise.all([
      this.repo.getQuota(userId, now),
      this.repo.nextScheduledAt(userId),
      this.repo.countByStatus(userId),
    ]);
    return {
      state: settings?.state ?? "IDLE",
      mode: settings?.mode ?? "DRAFT",
      quotaToday,
      dailyLimit: settings?.dailyLimit ?? 50,
      nextScheduledAt,
      countsByStatus,
    };
  }
}

export const campaignService = new CampaignService();
