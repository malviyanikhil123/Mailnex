import { db } from "../../db/index.js";
import { emailLogs } from "../../db/schema/logs.js";
import { contacts } from "../../db/schema/contacts.js";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { LogInput } from "../../jobs/send-email.js";

export type EmailLog = typeof emailLogs.$inferSelect;

export interface ListLogsQuery {
  status?: "sent" | "failed" | "bounced";
  search?: string;
  page?: number;
  limit?: number;
}

/** Maps the public status filter to the concrete log_status enum values. */
const STATUS_FILTER: Record<string, EmailLog["status"][]> = {
  sent: ["SENT"],
  failed: ["FAILED"],
  bounced: ["BOUNCED"],
};

export class LogsRepo {
  /** Concrete implementation of the send-email job's LogsPort for a specific user. */
  async create(userId: number, log: LogInput): Promise<void> {
    await db.insert(emailLogs).values({
      userId,
      contactId: log.contactId,
      templateId: log.templateId ?? null,
      subject: log.subject,
      body: log.body,
      mode: log.mode as EmailLog["mode"],
      status: log.status as EmailLog["status"],
      failureType: log.failureType ?? null,
      errorCode: log.errorCode ?? null,
      errorMessage: log.errorMessage ?? null,
      retryCount: log.retryCount ?? 0,
      nextRetryAt: log.nextRetryAt ?? null,
      aiUsed: log.aiUsed,
      sentAt: log.sentAt ?? null,
    });
  }

  async list(userId: number, query: ListLogsQuery): Promise<{ rows: EmailLog[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const conditions = [eq(emailLogs.userId, userId)];

    if (query.status && STATUS_FILTER[query.status]) {
      const allowed = STATUS_FILTER[query.status];
      conditions.push(
        allowed.length === 1
          ? eq(emailLogs.status, allowed[0])
          : or(...allowed.map((s) => eq(emailLogs.status, s)))!,
      );
    }
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(or(ilike(emailLogs.subject, like), ilike(emailLogs.errorMessage, like))!);
    }

    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(emailLogs)
        .where(where)
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)::int` }).from(emailLogs).where(where),
    ]);

    return { rows, total };
  }

  /** Joined view for the logs page: log + contact email/company for a specific user. */
  async listWithContact(userId: number, query: ListLogsQuery): Promise<{ rows: unknown[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const conditions = [eq(emailLogs.userId, userId)];

    if (query.status && STATUS_FILTER[query.status]) {
      const allowed = STATUS_FILTER[query.status];
      conditions.push(
        allowed.length === 1
          ? eq(emailLogs.status, allowed[0])
          : or(...allowed.map((s) => eq(emailLogs.status, s)))!,
      );
    }
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(or(ilike(emailLogs.subject, like), ilike(emailLogs.errorMessage, like))!);
    }
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: emailLogs.id,
          contactId: emailLogs.contactId,
          companyName: contacts.companyName,
          email: contacts.email,
          subject: emailLogs.subject,
          mode: emailLogs.mode,
          status: emailLogs.status,
          failureType: emailLogs.failureType,
          errorMessage: emailLogs.errorMessage,
          retryCount: emailLogs.retryCount,
          nextRetryAt: emailLogs.nextRetryAt,
          aiUsed: emailLogs.aiUsed,
          sentAt: emailLogs.sentAt,
          createdAt: emailLogs.createdAt,
        })
        .from(emailLogs)
        .leftJoin(contacts, eq(emailLogs.contactId, contacts.id))
        .where(where)
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)::int` }).from(emailLogs).where(where),
    ]);
    return { rows, total };
  }
}

export const logsRepo = new LogsRepo();
