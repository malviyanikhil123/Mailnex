import { db } from "../../db/index.js";
import { contacts } from "../../db/schema/contacts.js";
import { emailLogs } from "../../db/schema/logs.js";
import { contactsImports } from "../../db/schema/imports.js";
import { dailyQuota } from "../../db/schema/quota.js";
import { sql, eq, and } from "drizzle-orm";

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
  generated: number;
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
  async contactCounts(userId: number): Promise<ContactCounts> {
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
      .from(contacts)
      .where(eq(contacts.userId, userId));
    return row;
  }

  async logCounts(userId: number): Promise<LogCounts> {
    const [row] = await db
      .select({
        generated: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        bounced: sql<number>`count(*) filter (where ${emailLogs.status} = 'BOUNCED')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} = 'FAILED')::int`,
        aiUsed: sql<number>`count(*) filter (where ${emailLogs.aiUsed} = true)::int`,
      })
      .from(emailLogs)
      .where(eq(emailLogs.userId, userId));
    return row;
  }

  async emailsSentToday(userId: number, dateKey: string): Promise<number> {
    const [row] = await db
      .select({ emailsSent: dailyQuota.emailsSent })
      .from(dailyQuota)
      .where(and(eq(dailyQuota.userId, userId), sql`${dailyQuota.date} = ${dateKey}`));
    return row?.emailsSent ?? 0;
  }

  async totalImportedContacts(userId: number): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${contactsImports.importedRows}), 0)::int` })
      .from(contactsImports)
      .where(eq(contactsImports.userId, userId));
    return row?.total ?? 0;
  }

  async averageEmailsPerDay(userId: number): Promise<number> {
    const [row] = await db
      .select({ avg: sql<number>`coalesce(avg(${dailyQuota.emailsSent}), 0)::float` })
      .from(dailyQuota)
      .where(eq(dailyQuota.userId, userId));
    return Math.round((row?.avg ?? 0) * 100) / 100;
  }

  async dailyTrends(userId: number, days: number): Promise<TrendPoint[]> {
    return db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${emailLogs.createdAt}), 'YYYY-MM-DD')`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} in ('FAILED','BOUNCED'))::int`,
      })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.userId, userId),
          sql`${emailLogs.createdAt} >= now() - (${days} || ' days')::interval`,
        ),
      )
      .groupBy(sql`date_trunc('day', ${emailLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${emailLogs.createdAt})`);
  }

  async monthlyTrends(userId: number, months: number): Promise<TrendPoint[]> {
    return db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${emailLogs.createdAt}), 'YYYY-MM')`,
        sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'SENT')::int`,
        failed: sql<number>`count(*) filter (where ${emailLogs.status} in ('FAILED','BOUNCED'))::int`,
      })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.userId, userId),
          sql`${emailLogs.createdAt} >= now() - (${months} || ' months')::interval`,
        ),
      )
      .groupBy(sql`date_trunc('month', ${emailLogs.createdAt})`)
      .orderBy(sql`date_trunc('month', ${emailLogs.createdAt})`);
  }

  async importHistory(userId: number, limit: number): Promise<(typeof contactsImports.$inferSelect)[]> {
    return db
      .select()
      .from(contactsImports)
      .where(eq(contactsImports.userId, userId))
      .orderBy(sql`${contactsImports.createdAt} desc`)
      .limit(limit);
  }
}

export const analyticsRepo = new AnalyticsRepo();
