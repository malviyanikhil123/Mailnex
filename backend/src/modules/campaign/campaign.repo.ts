import { db } from "../../db/index.js";
import { campaignSettings, campaignQueue } from "../../db/schema/campaign.js";
import { dailyQuota } from "../../db/schema/quota.js";
import { contacts } from "../../db/schema/contacts.js";
import { and, eq, lte, or, isNull, sql, asc } from "drizzle-orm";

export type CampaignSettings = typeof campaignSettings.$inferSelect;
export type QueueItem = typeof campaignQueue.$inferSelect;
export type CampaignStateValue = CampaignSettings["state"];
export type CampaignModeValue = CampaignSettings["mode"];

/** Format a Date to a YYYY-MM-DD string (the `date` column type). */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class CampaignRepo {
  // ---- settings --------------------------------------------------------------

  async getSettings(userId: number): Promise<CampaignSettings | null> {
    const [row] = await db.select().from(campaignSettings).where(eq(campaignSettings.userId, userId)).limit(1);
    return row ?? null;
  }

  async getAllRunningSettings(): Promise<CampaignSettings[]> {
    return db.select().from(campaignSettings).where(eq(campaignSettings.state, "RUNNING"));
  }

  private async patchSettings(userId: number, patch: Partial<CampaignSettings>): Promise<CampaignSettings> {
    const existing = await this.getSettings(userId);
    if (!existing) {
      const [row] = await db
        .insert(campaignSettings)
        .values({ ...patch, userId, updatedAt: new Date() })
        .returning();
      return row;
    }
    const [row] = await db
      .update(campaignSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(campaignSettings.id, existing.id))
      .returning();
    return row;
  }

  setState(userId: number, state: CampaignStateValue): Promise<CampaignSettings> {
    return this.patchSettings(userId, { state });
  }

  setMode(userId: number, mode: CampaignModeValue): Promise<CampaignSettings> {
    return this.patchSettings(userId, { mode });
  }

  updateSettings(userId: number, patch: Partial<CampaignSettings>): Promise<CampaignSettings> {
    return this.patchSettings(userId, patch);
  }

  // ---- queue -----------------------------------------------------------------

  async enqueue(userId: number, rows: { contactId: number; scheduledAt: Date }[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(campaignQueue)
      .values(rows.map((r) => ({ userId, contactId: r.contactId, scheduledAt: r.scheduledAt })))
      .returning({ id: campaignQueue.id });
    return inserted.length;
  }

  /** SCHEDULED queue items whose time has arrived, oldest first. */
  async dueQueueItems(userId: number, now: Date, limit = 100): Promise<{ id: number; contactId: number }[]> {
    return db
      .select({ id: campaignQueue.id, contactId: campaignQueue.contactId })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.userId, userId),
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

  /** Cancel all not-yet-sent (SCHEDULED) queue rows for a specific user. */
  async clearScheduledQueue(userId: number): Promise<void> {
    await db
      .update(campaignQueue)
      .set({ status: "CANCELLED" })
      .where(and(eq(campaignQueue.userId, userId), eq(campaignQueue.status, "SCHEDULED")));
  }

  /** Count of SCHEDULED queue rows for "today" (rows scheduled on or after dayStart). */
  async countScheduledForDay(userId: number, dayStart: Date): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.userId, userId),
          eq(campaignQueue.status, "SCHEDULED"),
          sql`${campaignQueue.scheduledAt} >= ${dayStart}`,
        ),
      );
    return row?.n ?? 0;
  }

  async nextScheduledAt(userId: number): Promise<Date | null> {
    const [row] = await db
      .select({ scheduledAt: campaignQueue.scheduledAt })
      .from(campaignQueue)
      .where(and(eq(campaignQueue.userId, userId), eq(campaignQueue.status, "SCHEDULED")))
      .orderBy(asc(campaignQueue.scheduledAt))
      .limit(1);
    return row?.scheduledAt ?? null;
  }

  // ---- contact selection -----------------------------------------------------

  /** Contacts eligible to be sent: PENDING and not waiting on a future retry for a specific user. */
  async selectableContacts(userId: number, limit: number, now: Date): Promise<{ id: number }[]> {
    if (limit <= 0) return [];
    return db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          eq(contacts.status, "PENDING"),
          or(isNull(contacts.nextRetryAt), lte(contacts.nextRetryAt, now)),
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

  async getQuota(userId: number, date: Date): Promise<number> {
    const key = toDateKey(date);
    const [row] = await db
      .select({ emailsSent: dailyQuota.emailsSent })
      .from(dailyQuota)
      .where(and(eq(dailyQuota.userId, userId), eq(dailyQuota.date, key)));
    return row?.emailsSent ?? 0;
  }

  /** Atomically increment user's quota counter for today. */
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

  async countByStatus(userId: number): Promise<Record<string, number>> {
    const rows = await db
      .select({ status: contacts.status, n: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .groupBy(contacts.status);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.n;
    return out;
  }
}

export const campaignRepo = new CampaignRepo();
