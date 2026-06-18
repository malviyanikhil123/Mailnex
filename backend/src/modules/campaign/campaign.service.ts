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

/** Builds generate-queue deps from a campaign repo. */
function genDeps(repo: CampaignRepo): GenerateQueueDeps {
  return {
    getSettings: async () => {
      const s = await repo.getSettings();
      return s
        ? { state: s.state, dailyLimit: s.dailyLimit, startHour: s.startHour, endHour: s.endHour }
        : null;
    },
    getQuota: (d) => repo.getQuota(d),
    countScheduledForDay: (d) => repo.countScheduledForDay(d),
    selectableContacts: (limit, now) => repo.selectableContacts(limit, now),
    enqueue: (rows) => repo.enqueue(rows),
  };
}

export class CampaignService {
  constructor(private repo: CampaignRepo = campaignRepo) {}

  /** Start: mark RUNNING and build today's queue immediately. */
  async start(now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState("RUNNING");
    await generateDailyQueue(genDeps(this.repo), now);
    return this.status(now);
  }

  async pause(now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState("PAUSED");
    return this.status(now);
  }

  async resume(now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState("RUNNING");
    await generateDailyQueue(genDeps(this.repo), now);
    return this.status(now);
  }

  /** Stop: mark STOPPED and cancel all not-yet-sent queue rows. */
  async stop(now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setState("STOPPED");
    await this.repo.clearScheduledQueue();
    return this.status(now);
  }

  async setMode(mode: string, now: Date = new Date()): Promise<CampaignStatus> {
    await this.repo.setMode(mode as Parameters<CampaignRepo["setMode"]>[0]);
    return this.status(now);
  }

  async status(now: Date = new Date()): Promise<CampaignStatus> {
    const settings = await this.repo.getSettings();
    const [quotaToday, nextScheduledAt, countsByStatus] = await Promise.all([
      this.repo.getQuota(now),
      this.repo.nextScheduledAt(),
      this.repo.countByStatus(),
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
