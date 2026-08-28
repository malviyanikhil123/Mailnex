import {
  analyticsRepo,
  type AnalyticsRepo,
  type ContactCounts,
  type LogCounts,
  type TrendPoint,
} from "./analytics.repo.js";

export interface DashboardStats {
  totalContacts: number;
  pending: number;
  sent: number;
  failed: number;
  bounced: number;
  emailsSentToday: number;
  successRate: number;
  failureRate: number;
  totalImportedContacts: number;
  totalEmailsGenerated: number;
  totalEmailsSent: number;
  totalBounced: number;
  totalFailed: number;
  aiUsagePercent: number;
  averageEmailsPerDay: number;
  importHistory: unknown[];
}

/** Pure: success/failure rates over attempted (sent + failed + bounced), as
 *  rounded percentages. Returns 0/0 when nothing attempted (no divide-by-zero). */
export function computeRates(c: { sent: number; failed: number; bounced: number }): {
  successRate: number;
  failureRate: number;
} {
  const attempted = c.sent + c.failed + c.bounced;
  if (attempted === 0) return { successRate: 0, failureRate: 0 };
  const successRate = Math.round((c.sent / attempted) * 1000) / 10;
  const failureRate = Math.round(((c.failed + c.bounced) / attempted) * 1000) / 10;
  return { successRate, failureRate };
}

/** Pure: percentage of generated emails that used AI personalization. */
export function aiUsagePercent(aiUsed: number, generated: number): number {
  if (generated === 0) return 0;
  return Math.round((aiUsed / generated) * 1000) / 10;
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class AnalyticsService {
  constructor(private repo: AnalyticsRepo = analyticsRepo) {}

  async dashboard(userId: number, now: Date = new Date()): Promise<DashboardStats> {
    const [contacts, logs, emailsSentToday, totalImportedContacts, averageEmailsPerDay, importHistory] =
      await Promise.all([
        this.repo.contactCounts(userId),
        this.repo.logCounts(userId),
        this.repo.emailsSentToday(userId, todayKey(now)),
        this.repo.totalImportedContacts(userId),
        this.repo.averageEmailsPerDay(userId),
        this.repo.importHistory(userId, 5),
      ]);

    const rates = computeRates({ sent: logs.sent, failed: logs.failed, bounced: logs.bounced });

    return {
      totalContacts: (contacts as ContactCounts).total,
      pending: contacts.pending,
      sent: contacts.sent,
      failed: contacts.failed,
      bounced: contacts.bounced,
      emailsSentToday,
      successRate: rates.successRate,
      failureRate: rates.failureRate,
      totalImportedContacts,
      totalEmailsGenerated: (logs as LogCounts).generated,
      totalEmailsSent: logs.sent,
      totalBounced: logs.bounced,
      totalFailed: logs.failed,
      aiUsagePercent: aiUsagePercent(logs.aiUsed, logs.generated),
      averageEmailsPerDay,
      importHistory,
    };
  }

  daily(userId: number, days = 14): Promise<TrendPoint[]> {
    return this.repo.dailyTrends(userId, days);
  }

  monthly(userId: number, months = 12): Promise<TrendPoint[]> {
    return this.repo.monthlyTrends(userId, months);
  }
}

export const analyticsService = new AnalyticsService();
