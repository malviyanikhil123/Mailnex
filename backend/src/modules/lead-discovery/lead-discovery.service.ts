import { LeadDiscoveryRepo, leadDiscoveryRepo as defaultRepo } from "./lead-discovery.repo.js";
import { LeadDiscoveryWorker, leadDiscoveryWorker as defaultWorker } from "./lead-discovery.worker.js";
import type {
  CreateDiscoveryJobInput,
  ListLeadsQuery,
  DiscoveryStats,
} from "./lead-discovery.types.js";
import { logger } from "../../utils/logger.js";

export class LeadDiscoveryService {
  constructor(
    private repo: LeadDiscoveryRepo = defaultRepo,
    private worker: LeadDiscoveryWorker = defaultWorker
  ) {}

  async startJob(userId: number, input: CreateDiscoveryJobInput) {
    const job = await this.repo.createJob(userId, input);

    // Run asynchronously in the background (fire-and-forget pattern standard in Fastify apps)
    this.worker.processJob(userId, job.id).catch((err) => {
      logger.error({ err, jobId: job.id, userId }, "Failed to process discovery job");
    });

    return job;
  }

  async getJob(userId: number, jobId: number) {
    return this.repo.getJobById(userId, jobId);
  }

  async listJobs(userId: number, limit = 20) {
    return this.repo.listJobs(userId, limit);
  }

  async listLeads(userId: number, query: ListLeadsQuery) {
    return this.repo.listLeads(userId, query);
  }

  async getStats(userId: number): Promise<DiscoveryStats> {
    return this.repo.getStats(userId);
  }

  async importLeads(userId: number, leadIds: number[]) {
    return this.repo.importLeadsToContacts(userId, leadIds);
  }

  async deleteJob(userId: number, jobId: number) {
    return this.repo.deleteJob(userId, jobId);
  }
}

export const leadDiscoveryService = new LeadDiscoveryService();
