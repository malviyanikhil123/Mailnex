import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeadDiscoveryService } from "./lead-discovery.service.js";
import { LeadDiscoveryRepo } from "./lead-discovery.repo.js";
import { LeadDiscoveryWorker } from "./lead-discovery.worker.js";

describe("LeadDiscoveryService", () => {
  let mockRepo: any;
  let mockWorker: any;
  let service: LeadDiscoveryService;
  const userId = 1;

  beforeEach(() => {
    mockRepo = {
      createJob: vi.fn().mockResolvedValue({ id: 42, userId, status: "QUEUED", targetCount: 50 }),
      getJobById: vi.fn().mockResolvedValue({ id: 42, userId, status: "COMPLETED" }),
      listJobs: vi.fn().mockResolvedValue([{ id: 42, status: "COMPLETED" }]),
      listLeads: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      getStats: vi.fn().mockResolvedValue({
        today: { emailsFound: 10, hrEmailsFound: 5 },
        yesterday: { emailsFound: 0 },
        last7Days: { emailsFound: 10 },
        last30Days: { emailsFound: 10 },
        dailyTrend: [],
      }),
      importLeadsToContacts: vi.fn().mockResolvedValue({ imported: 2, skipped: 0 }),
      deleteJob: vi.fn().mockResolvedValue(true),
    };

    mockWorker = {
      processJob: vi.fn().mockResolvedValue(undefined),
    };

    service = new LeadDiscoveryService(mockRepo as LeadDiscoveryRepo, mockWorker as LeadDiscoveryWorker);
  });

  it("creates a job and triggers worker processing asynchronously", async () => {
    const job = await service.startJob(userId, {
      location: "India",
      profession: "IT",
      targetCount: 100,
    });

    expect(job.id).toBe(42);
    expect(mockRepo.createJob).toHaveBeenCalledWith(userId, {
      location: "India",
      profession: "IT",
      targetCount: 100,
    });
    expect(mockWorker.processJob).toHaveBeenCalledWith(userId, 42);
  });

  it("delegates importLeads to repo", async () => {
    const result = await service.importLeads(userId, [101, 102]);
    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(mockRepo.importLeadsToContacts).toHaveBeenCalledWith(userId, [101, 102]);
  });
});
