import { db } from "../../db/index.js";
import { campaigns, campaignQueue, campaignTemplates } from "../../db/schema/campaign.js";
import { dailyQuota } from "../../db/schema/quota.js";
import { contacts } from "../../db/schema/contacts.js";
import { contactsImports } from "../../db/schema/imports.js";
import { emailLogs } from "../../db/schema/logs.js";
import { and, eq, lte, gte, or, isNull, sql, asc, desc, inArray, ne, notExists } from "drizzle-orm";

export type Campaign = typeof campaigns.$inferSelect;
export type CampaignInsert = typeof campaigns.$inferInsert;
export type QueueItem = typeof campaignQueue.$inferSelect;
export type CampaignStateValue = Campaign["state"];
export type CampaignModeValue = Campaign["mode"];

/** Format a Date to a YYYY-MM-DD string (the `date` column type). */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local midnight of the given day — the start of the sending day. */
export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export class CampaignRepo {
  // ---- campaigns -------------------------------------------------------------

  async list(userId: number): Promise<(Campaign & { importName: string | null; templateIds: number[] })[]> {
    const rows = await db
      .select({ campaign: campaigns, importName: sql<string | null>`coalesce(${contactsImports.name}, ${contactsImports.fileName})` })
      .from(campaigns)
      .leftJoin(contactsImports, eq(campaigns.importId, contactsImports.id))
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt));
    const templateMap = await this.templateIdsFor(rows.map((r) => r.campaign.id));
    return rows.map((r) => ({ ...r.campaign, importName: r.importName, templateIds: templateMap.get(r.campaign.id) ?? [] }));
  }

  async get(userId: number, id: number): Promise<Campaign | null> {
    const [row] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async getById(id: number): Promise<Campaign | null> {
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    return row ?? null;
  }

  async getAllRunning(): Promise<Campaign[]> {
    return db.select().from(campaigns).where(eq(campaigns.state, "RUNNING"));
  }

  async create(userId: number, values: Omit<CampaignInsert, "id" | "userId">): Promise<Campaign> {
    const [row] = await db.insert(campaigns).values({ ...values, userId }).returning();
    return row;
  }

  async update(userId: number, id: number, patch: Partial<Campaign>): Promise<Campaign | null> {
    const [row] = await db
      .update(campaigns)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .returning();
    return row ?? null;
  }

  async remove(userId: number, id: number): Promise<boolean> {
    const rows = await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  async setState(id: number, state: CampaignStateValue): Promise<void> {
    await db.update(campaigns).set({ state, updatedAt: new Date() }).where(eq(campaigns.id, id));
  }

  /** Another RUNNING/PAUSED campaign of this user that already works through the import. */
  async activeCampaignForImport(userId: number, importId: number, excludeId: number): Promise<Campaign | null> {
    const [row] = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.userId, userId),
          eq(campaigns.importId, importId),
          ne(campaigns.id, excludeId),
          inArray(campaigns.state, ["RUNNING", "PAUSED"]),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ---- campaign templates ----------------------------------------------------

  async templateIdsFor(campaignIds: number[]): Promise<Map<number, number[]>> {
    const out = new Map<number, number[]>();
    if (campaignIds.length === 0) return out;
    const rows = await db
      .select({ campaignId: campaignTemplates.campaignId, templateId: campaignTemplates.templateId })
      .from(campaignTemplates)
      .where(inArray(campaignTemplates.campaignId, campaignIds));
    for (const r of rows) out.set(r.campaignId, [...(out.get(r.campaignId) ?? []), r.templateId]);
    return out;
  }

  async setTemplates(campaignId: number, templateIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(campaignTemplates).where(eq(campaignTemplates.campaignId, campaignId));
      if (templateIds.length > 0) {
        await tx.insert(campaignTemplates).values(templateIds.map((templateId) => ({ campaignId, templateId })));
      }
    });
  }

  // ---- queue -----------------------------------------------------------------

  async enqueue(userId: number, campaignId: number, rows: { contactId: number; scheduledAt: Date }[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(campaignQueue)
      .values(rows.map((r) => ({ userId, campaignId, contactId: r.contactId, scheduledAt: r.scheduledAt })))
      .returning({ id: campaignQueue.id });
    return inserted.length;
  }

  /** SCHEDULED queue items of a campaign whose time has arrived, oldest first. */
  async dueQueueItems(
    campaignId: number,
    now: Date,
    limit = 100,
  ): Promise<{ id: number; contactId: number; scheduledAt: Date }[]> {
    return db
      .select({ id: campaignQueue.id, contactId: campaignQueue.contactId, scheduledAt: campaignQueue.scheduledAt })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, "SCHEDULED"),
          lte(campaignQueue.scheduledAt, now),
        ),
      )
      .orderBy(asc(campaignQueue.scheduledAt))
      .limit(limit);
  }

  async markQueue(id: number, status: QueueItem["status"]): Promise<void> {
    await db.update(campaignQueue).set({ status }).where(eq(campaignQueue.id, id));
  }

  /** Cancel all not-yet-sent (SCHEDULED) queue rows of a campaign. */
  async clearScheduledQueue(campaignId: number): Promise<void> {
    await db
      .update(campaignQueue)
      .set({ status: "CANCELLED" })
      .where(and(eq(campaignQueue.campaignId, campaignId), eq(campaignQueue.status, "SCHEDULED")));
  }

  /** Count of SCHEDULED queue rows of a campaign for "today" (scheduled on or after dayStart). */
  async countScheduledForDay(campaignId: number, dayStart: Date): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, "SCHEDULED"),
          gte(campaignQueue.scheduledAt, dayStart),
        ),
      );
    return row?.n ?? 0;
  }

  async nextScheduledAt(campaignId: number): Promise<Date | null> {
    const [row] = await db
      .select({ scheduledAt: campaignQueue.scheduledAt })
      .from(campaignQueue)
      .where(and(eq(campaignQueue.campaignId, campaignId), eq(campaignQueue.status, "SCHEDULED")))
      .orderBy(asc(campaignQueue.scheduledAt))
      .limit(1);
    return row?.scheduledAt ?? null;
  }

  // ---- contact selection -----------------------------------------------------

  /** Contacts of the campaign's import that can be sent now: PENDING, not waiting on a
   *  future retry, and not already sitting in another queue row. */
  async selectableContacts(campaign: Campaign, limit: number, now: Date): Promise<{ id: number }[]> {
    if (limit <= 0 || campaign.importId == null) return [];
    return db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, campaign.userId),
          eq(contacts.importId, campaign.importId),
          eq(contacts.status, "PENDING"),
          or(isNull(contacts.nextRetryAt), lte(contacts.nextRetryAt, now)),
          notExists(
            db
              .select({ one: sql`1` })
              .from(campaignQueue)
              .where(
                and(
                  eq(campaignQueue.contactId, contacts.id),
                  inArray(campaignQueue.status, ["SCHEDULED", "PROCESSING"]),
                ),
              ),
          ),
        ),
      )
      .limit(limit);
  }

  // ---- contact mutations (used by the send-email job) ------------------------

  async getContact(id: number) {
    const [row] = await db
      .select({
        id: contacts.id,
        userId: contacts.userId,
        companyName: contacts.companyName,
        location: contacts.location,
        email: contacts.email,
        status: contacts.status,
        retryCount: contacts.retryCount,
        lastContactedAt: contacts.lastContactedAt,
        sentAt: contacts.sentAt,
      })
      .from(contacts)
      .where(eq(contacts.id, id));
    return row ?? null;
  }

  async markContactProcessing(id: number): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "PROCESSING", updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  async markContactSent(id: number, sentAt: Date): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "SENT", sentAt, lastContactedAt: sentAt, updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  async markContactBounced(id: number): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "BOUNCED", updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  async markContactFailed(id: number): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  async scheduleRetry(id: number, retryCount: number, nextRetryAt: Date): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "PENDING", retryCount, nextRetryAt, updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  async resetContactPending(id: number): Promise<void> {
    await db
      .update(contacts)
      .set({ status: "PENDING", updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  // ---- quota -----------------------------------------------------------------

  /** Emails a campaign has actually sent since the start of `date`'s day. */
  async sentToday(campaignId: number, date: Date): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.campaignId, campaignId),
          eq(emailLogs.status, "SENT"),
          gte(emailLogs.sentAt, startOfDay(date)),
        ),
      );
    return row?.n ?? 0;
  }

  /** Emails sent today plus emails still scheduled today across every campaign of the
   *  user that sends from the given sender (null = primary Gmail), excluding one campaign. */
  async senderUsageToday(
    userId: number,
    senderAccountId: number | null,
    date: Date,
    excludeCampaignId: number,
  ): Promise<number> {
    const dayStart = startOfDay(date);
    const senderMatch = senderAccountId == null
      ? isNull(campaigns.senderAccountId)
      : eq(campaigns.senderAccountId, senderAccountId);
    const [sent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLogs)
      .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
      .where(and(eq(campaigns.userId, userId), senderMatch, eq(emailLogs.status, "SENT"), gte(emailLogs.sentAt, dayStart)));
    const [scheduled] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaignQueue)
      .innerJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
      .where(
        and(
          eq(campaigns.userId, userId),
          senderMatch,
          ne(campaigns.id, excludeCampaignId),
          eq(campaignQueue.status, "SCHEDULED"),
          gte(campaignQueue.scheduledAt, dayStart),
        ),
      );
    return (sent?.n ?? 0) + (scheduled?.n ?? 0);
  }

  /** Atomically increment the user's overall quota counter for today (used by analytics). */
  async incQuota(userId: number, date: Date): Promise<number> {
    const key = toDateKey(date);
    const [row] = await db
      .insert(dailyQuota)
      .values({ userId, date: key, emailsSent: 1 })
      .onConflictDoUpdate({
        target: [dailyQuota.date, dailyQuota.userId],
        set: { emailsSent: sql`${dailyQuota.emailsSent} + 1` },
      })
      .returning({ emailsSent: dailyQuota.emailsSent });
    return row?.emailsSent ?? 0;
  }

  // ---- analytics-ish ---------------------------------------------------------

  /** Contact status counts for the campaign's import. */
  async countByStatus(campaign: Campaign): Promise<Record<string, number>> {
    if (campaign.importId == null) return {};
    const rows = await db
      .select({ status: contacts.status, n: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(eq(contacts.userId, campaign.userId), eq(contacts.importId, campaign.importId)))
      .groupBy(contacts.status);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.n;
    return out;
  }
}

export const campaignRepo = new CampaignRepo();
