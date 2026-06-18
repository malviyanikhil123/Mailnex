import { db } from "../../db/index.js";
import { contacts } from "../../db/schema/contacts.js";
import { emailLogs } from "../../db/schema/logs.js";
import { contactsImports } from "../../db/schema/imports.js";
import { dailyQuota } from "../../db/schema/quota.js";
import { sql } from "drizzle-orm";

export interface ContactCounts {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  bounced: number;
  paused: number;
}

export interface LogCounts {
  generated: number; // every email_logs row = one generated content
  sent: number;
  bounced: number;
  failed: number;
  aiUsed: number;
}

export interface TrendPoint {
  bucket: string;
  sent: number;
  failed: number;
}

export class AnalyticsRepo {
  async contactCounts(): Promise<ContactCounts> {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${contacts.status} = 'PENDING')::int`,
        processing: sql<number>`count(*) filter (where ${contacts.status} = 'PROCESSING')::int`,
        sent: sql<number>`count(*) filter (where ${contacts.status} = 'SENT')::int`,
        failed: sql<number>`count(*) filter (where ${contacts.status} = 'FAILED')::int`,
        bounced: sql<number>`count(*) filter (where ${contacts.status} = 'BOUNCED')::int`,
        paused: sql<number>`count(*) filter (where ${contacts.status} = 'PAUSED')::int`,
      })
      .from(contacts);
    return row;
  }

  async logCounts(): Promise<LogCounts> {
    const [row] = await db
      .select({
        generated: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        bounced: sql<number>`count(*) filter (where ${emailLogs.status} = 'BOUNCED')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} = 'FAILED')::int`,
        aiUsed: sql<number>`count(*) filter (where ${emailLogs.aiUsed} = true)::int`,
      })
      .from(emailLogs);
    return row;
  }

  async emailsSentToday(dateKey: string): Promise<number> {
    const [row] = await db
      .select({ emailsSent: dailyQuota.emailsSent })
      .from(dailyQuota)
      .where(sql`${dailyQuota.date} = ${dateKey}`);
    return row?.emailsSent ?? 0;
  }

  async totalImportedContacts(): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${contactsImports.importedRows}), 0)::int` })
      .from(contactsImports);
    return row?.total ?? 0;
  }

  async averageEmailsPerDay(): Promise<number> {
    const [row] = await db
      .select({ avg: sql<number>`coalesce(avg(${dailyQuota.emailsSent}), 0)::float` })
      .from(dailyQuota);
    return Math.round((row?.avg ?? 0) * 100) / 100;
  }

  async dailyTrends(days: number): Promise<TrendPoint[]> {
    return db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${emailLogs.createdAt}), 'YYYY-MM-DD')`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} in ('FAILED','BOUNCED'))::int`,
      })
      .from(emailLogs)
      .where(sql`${emailLogs.createdAt} >= now() - (${days} || ' days')::interval`)
      .groupBy(sql`date_trunc('day', ${emailLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${emailLogs.createdAt})`);
  }

  async monthlyTrends(months: number): Promise<TrendPoint[]> {
    return db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${emailLogs.createdAt}), 'YYYY-MM')`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} in ('FAILED','BOUNCED'))::int`,
      })
      .from(emailLogs)
      .where(sql`${emailLogs.createdAt} >= now() - (${months} || ' months')::interval`)
      .groupBy(sql`date_trunc('month', ${emailLogs.createdAt})`)
      .orderBy(sql`date_trunc('month', ${emailLogs.createdAt})`);
  }

  async importHistory(limit: number): Promise<(typeof contactsImports.$inferSelect)[]> {
    return db
      .select()
      .from(contactsImports)
      .orderBy(sql`${contactsImports.createdAt} desc`)
      .limit(limit);
  }
}

export const analyticsRepo = new AnalyticsRepo();
