import { describe, it, expect } from "vitest";
import {
  AnalyticsService,
  computeRates,
  aiUsagePercent,
} from "./analytics.service.js";
import type { AnalyticsRepo } from "./analytics.repo.js";

describe("computeRates", () => {
  it("returns 0/0 when nothing attempted", () => {
    expect(computeRates({ sent: 0, failed: 0, bounced: 0 })).toEqual({
      successRate: 0,
      failureRate: 0,
    });
  });

  it("computes success/failure percentages over attempted", () => {
    // attempted = 7+2+1 = 10 → success 70, failure 30
    expect(computeRates({ sent: 7, failed: 2, bounced: 1 })).toEqual({
      successRate: 70,
      failureRate: 30,
    });
  });
});

describe("aiUsagePercent", () => {
  it("returns 0 when none generated", () => {
    expect(aiUsagePercent(0, 0)).toBe(0);
  });
  it("computes percentage", () => {
    expect(aiUsagePercent(3, 4)).toBe(75);
  });
});

describe("AnalyticsService.dashboard", () => {
  it("composes counts, rates and AI usage from the repo", async () => {
    const repo = {
      contactCounts: async () => ({
        total: 100,
        pending: 60,
        processing: 0,
        sent: 30,
        failed: 5,
        bounced: 5,
        paused: 0,
      }),
      logCounts: async () => ({ generated: 40, sent: 30, bounced: 5, failed: 5, aiUsed: 20 }),
      emailsSentToday: async () => 12,
      totalImportedContacts: async () => 23800,
      averageEmailsPerDay: async () => 10.5,
      importHistory: async () => [{ id: 1, fileName: "contacts.xlsx" }],
      dailyTrends: async () => [],
      monthlyTrends: async () => [],
    } as unknown as AnalyticsRepo;

    const service = new AnalyticsService(repo);
    const d = await service.dashboard(new Date(2026, 5, 18));

    expect(d.totalContacts).toBe(100);
    expect(d.pending).toBe(60);
    expect(d.emailsSentToday).toBe(12);
    // attempted = 30+5+5 = 40 → success 75, failure 25
    expect(d.successRate).toBe(75);
    expect(d.failureRate).toBe(25);
    expect(d.totalImportedContacts).toBe(23800);
    expect(d.totalEmailsGenerated).toBe(40);
    expect(d.totalEmailsSent).toBe(30);
    expect(d.aiUsagePercent).toBe(50); // 20/40
    expect(d.averageEmailsPerDay).toBe(10.5);
    expect(d.importHistory).toHaveLength(1);
  });
});
