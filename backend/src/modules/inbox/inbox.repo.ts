import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  inboxCategories,
  inboxCategoryRules,
  inboxMessages,
  inboxSyncState,
} from "../../db/schema/inbox.js";
import type { JobStatus, RuleLike } from "./rules-engine.js";
import type { ListMessagesQuery } from "./inbox.schema.js";

export type InboxCategory = typeof inboxCategories.$inferSelect;
export type InboxRule = typeof inboxCategoryRules.$inferSelect;
export type InboxMessage = typeof inboxMessages.$inferSelect;
export type InboxSyncState = typeof inboxSyncState.$inferSelect;
export type NewInboxMessage = typeof inboxMessages.$inferInsert;

export interface CategoryWithCounts extends InboxCategory {
  ruleCount: number;
  messageCount: number;
  unreadCount: number;
}

export interface Assignment {
  categoryId: number | null;
  assignmentSource: "NONE" | "RULE" | "AI" | "MANUAL";
  matchedRuleId: number | null;
  aiConfidence: number | null;
  aiReason: string | null;
  jobStatus: JobStatus | null;
  jobStatusSource: "NONE" | "RULE" | "AI" | "MANUAL" | null;
  jobCompany: string | null;
  jobRole: string | null;
  classifiedAt: Date;
}

/** Everything the list view needs, including a human-readable "why". */
const MESSAGE_LIST_COLUMNS = {
  id: inboxMessages.id,
  categoryId: inboxMessages.categoryId,
  categoryName: inboxCategories.name,
  categoryColor: inboxCategories.color,
  assignmentSource: inboxMessages.assignmentSource,
  matchedRuleId: inboxMessages.matchedRuleId,
  aiConfidence: inboxMessages.aiConfidence,
  aiReason: inboxMessages.aiReason,
  manualOverride: inboxMessages.manualOverride,
  classifiedAt: inboxMessages.classifiedAt,
  jobStatus: inboxMessages.jobStatus,
  jobCompany: inboxMessages.jobCompany,
  jobRole: inboxMessages.jobRole,
  fromName: inboxMessages.fromName,
  fromAddress: inboxMessages.fromAddress,
  fromDomain: inboxMessages.fromDomain,
  subject: inboxMessages.subject,
  snippet: inboxMessages.snippet,
  receivedAt: inboxMessages.receivedAt,
  isUnread: inboxMessages.isUnread,
  hasAttachments: inboxMessages.hasAttachments,
  state: inboxMessages.state,
  deleteError: inboxMessages.deleteError,
  // Built here so the frontend never has to fetch rules just to render a badge.
  matchedRuleLabel: sql<string | null>`case when ${inboxCategoryRules.id} is null then null else
    lower(replace(${inboxCategoryRules.field}::text, '_', ' ')) || ' ' ||
    lower(replace(${inboxCategoryRules.matchType}::text, '_', ' ')) || ' ' ||
    '"' || ${inboxCategoryRules.value} || '"' end`,
};

export class InboxRepo {
  // ---- categories -----------------------------------------------------------

  async listCategories(userId: number): Promise<CategoryWithCounts[]> {
    const rows = await db
      .select({
        category: inboxCategories,
        // Table names are written out rather than interpolated with ${table.column}:
        // drizzle renders those unqualified, so inside a correlated subquery "id"
        // binds to the SUBQUERY's table instead of inbox_categories. That silently
        // turned every count into "rows where category_id = own id" — always 1.
        ruleCount: sql<number>`(select count(*)::int from inbox_category_rules r
          where r.category_id = inbox_categories.id)`,
        messageCount: sql<number>`(select count(*)::int from inbox_messages m
          where m.category_id = inbox_categories.id and m.state = 'ACTIVE')`,
        unreadCount: sql<number>`(select count(*)::int from inbox_messages m
          where m.category_id = inbox_categories.id and m.state = 'ACTIVE' and m.is_unread = true)`,
      })
      .from(inboxCategories)
      .where(eq(inboxCategories.userId, userId))
      .orderBy(asc(inboxCategories.sortOrder), asc(inboxCategories.id));

    return rows.map((r) => ({
      ...r.category,
      ruleCount: r.ruleCount,
      messageCount: r.messageCount,
      unreadCount: r.unreadCount,
    }));
  }

  async getCategory(userId: number, id: number): Promise<InboxCategory | null> {
    const [row] = await db
      .select()
      .from(inboxCategories)
      .where(and(eq(inboxCategories.id, id), eq(inboxCategories.userId, userId)));
    return row ?? null;
  }

  async createCategory(
    userId: number,
    values: { name: string; slug: string; description?: string; color?: string; trackSubStatus?: boolean; sortOrder?: number },
  ): Promise<InboxCategory> {
    const [row] = await db.insert(inboxCategories).values({ ...values, userId }).returning();
    return row!;
  }

  async updateCategory(
    userId: number,
    id: number,
    patch: Partial<{ name: string; slug: string; description: string; color: string; trackSubStatus: boolean; sortOrder: number }>,
  ): Promise<InboxCategory | null> {
    const [row] = await db
      .update(inboxCategories)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(inboxCategories.id, id), eq(inboxCategories.userId, userId)))
      .returning();
    return row ?? null;
  }

  /**
   * Moves this category's mail somewhere else, then deletes the category.
   * Mail is never deleted with a category — worst case it becomes Uncategorized.
   */
  async deleteCategory(
    userId: number,
    id: number,
    reassignTo: number | null,
  ): Promise<{ deleted: boolean; reassigned: number }> {
    const moved = await db
      .update(inboxMessages)
      .set({
        categoryId: reassignTo,
        // A reassignment is a bulk manual decision, so it must survive re-classify.
        assignmentSource: "MANUAL",
        manualOverride: true,
        matchedRuleId: null,
        aiConfidence: null,
        aiReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(inboxMessages.userId, userId), eq(inboxMessages.categoryId, id)))
      .returning({ id: inboxMessages.id });

    const [row] = await db
      .delete(inboxCategories)
      .where(and(eq(inboxCategories.id, id), eq(inboxCategories.userId, userId)))
      .returning({ id: inboxCategories.id });

    return { deleted: !!row, reassigned: moved.length };
  }

  async reorderCategories(userId: number, order: number[]): Promise<number> {
    let updated = 0;
    for (let i = 0; i < order.length; i++) {
      const res = await db
        .update(inboxCategories)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(inboxCategories.id, order[i]!), eq(inboxCategories.userId, userId)))
        .returning({ id: inboxCategories.id });
      updated += res.length;
    }
    return updated;
  }

  async countCategories(userId: number): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inboxCategories)
      .where(eq(inboxCategories.userId, userId));
    return row?.n ?? 0;
  }

  // ---- rules ----------------------------------------------------------------

  async listRules(userId: number, categoryId?: number): Promise<InboxRule[]> {
    const where = categoryId
      ? and(eq(inboxCategoryRules.userId, userId), eq(inboxCategoryRules.categoryId, categoryId))
      : eq(inboxCategoryRules.userId, userId);
    return db
      .select()
      .from(inboxCategoryRules)
      .where(where)
      .orderBy(asc(inboxCategoryRules.priority), asc(inboxCategoryRules.id));
  }

  /** Only what the engine needs, and only enabled rules. */
  async listEnabledRules(userId: number): Promise<RuleLike[]> {
    const rows = await db
      .select({
        id: inboxCategoryRules.id,
        categoryId: inboxCategoryRules.categoryId,
        field: inboxCategoryRules.field,
        matchType: inboxCategoryRules.matchType,
        valueNormalized: inboxCategoryRules.valueNormalized,
        priority: inboxCategoryRules.priority,
        enabled: inboxCategoryRules.enabled,
        subStatus: inboxCategoryRules.subStatus,
      })
      .from(inboxCategoryRules)
      .where(and(eq(inboxCategoryRules.userId, userId), eq(inboxCategoryRules.enabled, true)));
    return rows as RuleLike[];
  }

  async getRule(userId: number, ruleId: number): Promise<InboxRule | null> {
    const [row] = await db
      .select()
      .from(inboxCategoryRules)
      .where(and(eq(inboxCategoryRules.id, ruleId), eq(inboxCategoryRules.userId, userId)));
    return row ?? null;
  }

  async createRule(
    userId: number,
    categoryId: number,
    values: {
      field: InboxRule["field"]; matchType: InboxRule["matchType"];
      value: string; valueNormalized: string;
      priority?: number; enabled?: boolean; subStatus?: JobStatus | null;
    },
  ): Promise<InboxRule> {
    const [row] = await db
      .insert(inboxCategoryRules)
      .values({ ...values, userId, categoryId })
      .returning();
    return row!;
  }

  async updateRule(
    userId: number,
    ruleId: number,
    patch: Partial<{
      field: InboxRule["field"]; matchType: InboxRule["matchType"];
      value: string; valueNormalized: string;
      priority: number; enabled: boolean; subStatus: JobStatus | null;
    }>,
  ): Promise<InboxRule | null> {
    const [row] = await db
      .update(inboxCategoryRules)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(inboxCategoryRules.id, ruleId), eq(inboxCategoryRules.userId, userId)))
      .returning();
    return row ?? null;
  }

  async deleteRule(userId: number, ruleId: number): Promise<boolean> {
    const [row] = await db
      .delete(inboxCategoryRules)
      .where(and(eq(inboxCategoryRules.id, ruleId), eq(inboxCategoryRules.userId, userId)))
      .returning({ id: inboxCategoryRules.id });
    return !!row;
  }

  /** Surfaces dead rules in the editor — a rule that never matches is worth seeing. */
  async bumpRuleMatch(ruleId: number, at: Date): Promise<void> {
    await db
      .update(inboxCategoryRules)
      .set({ matchCount: sql`${inboxCategoryRules.matchCount} + 1`, lastMatchedAt: at })
      .where(eq(inboxCategoryRules.id, ruleId));
  }

  // ---- messages -------------------------------------------------------------

  async listMessages(userId: number, q: ListMessagesQuery) {
    const conds = [eq(inboxMessages.userId, userId), eq(inboxMessages.state, q.state)];

    if (q.categoryId === "uncategorized") conds.push(isNull(inboxMessages.categoryId));
    else if (typeof q.categoryId === "number") conds.push(eq(inboxMessages.categoryId, q.categoryId));

    if (q.source) conds.push(eq(inboxMessages.assignmentSource, q.source));
    if (q.jobStatus) conds.push(eq(inboxMessages.jobStatus, q.jobStatus));
    if (q.unread !== undefined) conds.push(eq(inboxMessages.isUnread, q.unread));
    if (q.search) {
      const like = `%${q.search}%`;
      conds.push(
        or(
          sql`${inboxMessages.subject} ilike ${like}`,
          sql`${inboxMessages.fromAddress} ilike ${like}`,
          sql`${inboxMessages.fromName} ilike ${like}`,
          sql`${inboxMessages.snippet} ilike ${like}`,
        )!,
      );
    }

    const where = and(...conds);

    const [rows, countRow] = await Promise.all([
      db
        .select(MESSAGE_LIST_COLUMNS)
        .from(inboxMessages)
        .leftJoin(inboxCategories, eq(inboxMessages.categoryId, inboxCategories.id))
        .leftJoin(inboxCategoryRules, eq(inboxMessages.matchedRuleId, inboxCategoryRules.id))
        .where(where)
        .orderBy(desc(inboxMessages.receivedAt), desc(inboxMessages.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ n: sql<number>`count(*)::int` }).from(inboxMessages).where(where),
    ]);

    return { rows, total: countRow[0]?.n ?? 0 };
  }

  async getMessage(userId: number, id: number) {
    const [row] = await db
      .select({
        ...MESSAGE_LIST_COLUMNS,
        bodyText: inboxMessages.bodyText,
        toAddress: inboxMessages.toAddress,
        messageId: inboxMessages.messageId,
        uid: inboxMessages.uid,
        mailbox: inboxMessages.mailbox,
        sizeBytes: inboxMessages.sizeBytes,
        gmailThreadId: inboxMessages.gmailThreadId,
      })
      .from(inboxMessages)
      .leftJoin(inboxCategories, eq(inboxMessages.categoryId, inboxCategories.id))
      .leftJoin(inboxCategoryRules, eq(inboxMessages.matchedRuleId, inboxCategoryRules.id))
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.userId, userId)));
    return row ?? null;
  }

  /**
   * Ingest. onConflictDoNothing on the UID tuple makes sync idempotent.
   *
   * Deliberately NOT onConflictDoUpdate: an incremental sync re-seeing a message
   * the user just deleted must not resurrect its state.
   */
  async insertManyMessages(
    userId: number,
    rows: Omit<NewInboxMessage, "userId">[],
  ): Promise<{ inserted: number }> {
    if (rows.length === 0) return { inserted: 0 };
    const res = await db
      .insert(inboxMessages)
      .values(rows.map((r) => ({ ...r, userId })))
      .onConflictDoNothing({
        target: [inboxMessages.userId, inboxMessages.mailbox, inboxMessages.uidValidity, inboxMessages.uid],
      })
      .returning({ id: inboxMessages.id });
    return { inserted: res.length };
  }

  /** Message-IDs already stored in the window, for best-effort dedupe on top of UIDs. */
  async existingMessageIds(userId: number, since: Date): Promise<Set<string>> {
    const rows = await db
      .select({ messageId: inboxMessages.messageId })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.userId, userId), gte(inboxMessages.receivedAt, since)));
    const set = new Set<string>();
    for (const r of rows) if (r.messageId) set.add(r.messageId);
    return set;
  }

  /**
   * Clears job statuses left behind when a category stops tracking them.
   * Stale statuses are meaningless and would skew the pipeline counts.
   */
  async clearJobStatusForCategory(userId: number, categoryId: number): Promise<number> {
    const res = await db
      .update(inboxMessages)
      .set({ jobStatus: null, jobStatusSource: null, jobCompany: null, jobRole: null, updatedAt: new Date() })
      .where(and(eq(inboxMessages.userId, userId), eq(inboxMessages.categoryId, categoryId)))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  /** Corpus for the rule dry-run. Includes already-sorted mail so counts are honest. */
  async listAllForRuleTest(userId: number, limit: number) {
    return db
      .select({
        id: inboxMessages.id,
        categoryId: inboxMessages.categoryId,
        fromAddress: inboxMessages.fromAddress,
        fromDomain: inboxMessages.fromDomain,
        subject: inboxMessages.subject,
        bodyText: inboxMessages.bodyText,
        snippet: inboxMessages.snippet,
        receivedAt: inboxMessages.receivedAt,
      })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.userId, userId), eq(inboxMessages.state, "ACTIVE")))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(limit);
  }

  /** Candidates for the "only unsorted" pass. */
  async listUnclassified(userId: number, limit: number) {
    return db
      .select({
        id: inboxMessages.id,
        fromAddress: inboxMessages.fromAddress,
        fromDomain: inboxMessages.fromDomain,
        subject: inboxMessages.subject,
        bodyText: inboxMessages.bodyText,
      })
      .from(inboxMessages)
      .where(and(
        eq(inboxMessages.userId, userId),
        eq(inboxMessages.assignmentSource, "NONE"),
        eq(inboxMessages.state, "ACTIVE"),
      ))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(limit);
  }

  /** Candidates for a full re-run. Manual picks are excluded at the query level too. */
  async listReclassifiable(userId: number, limit: number) {
    return db
      .select({
        id: inboxMessages.id,
        fromAddress: inboxMessages.fromAddress,
        fromDomain: inboxMessages.fromDomain,
        subject: inboxMessages.subject,
        bodyText: inboxMessages.bodyText,
      })
      .from(inboxMessages)
      .where(and(
        eq(inboxMessages.userId, userId),
        eq(inboxMessages.manualOverride, false),
        eq(inboxMessages.state, "ACTIVE"),
      ))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(limit);
  }

  /**
   * Writes an automatic (rule or AI) assignment.
   *
   * The `manual_override = false` predicate is the stickiness guarantee, enforced in
   * the database rather than only by the candidate query — so even a future caller
   * that picks the wrong candidate set cannot clobber a manual pick.
   */
  async applyAssignment(userId: number, messageId: number, a: Assignment): Promise<boolean> {
    const res = await db
      .update(inboxMessages)
      .set({
        categoryId: a.categoryId,
        assignmentSource: a.assignmentSource,
        matchedRuleId: a.matchedRuleId,
        aiConfidence: a.aiConfidence,
        aiReason: a.aiReason,
        jobStatus: a.jobStatus,
        jobStatusSource: a.jobStatusSource,
        jobCompany: a.jobCompany,
        jobRole: a.jobRole,
        classifiedAt: a.classifiedAt,
        updatedAt: new Date(),
      })
      .where(and(
        eq(inboxMessages.id, messageId),
        eq(inboxMessages.userId, userId),
        eq(inboxMessages.manualOverride, false),
      ))
      .returning({ id: inboxMessages.id });
    return res.length > 0;
  }

  /** A user's own choice. Clears the AI trail and raises the sticky flag. */
  async setManualAssignment(
    userId: number,
    ids: number[],
    categoryId: number | null,
    jobStatus: JobStatus | null,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await db
      .update(inboxMessages)
      .set({
        categoryId,
        assignmentSource: "MANUAL",
        manualOverride: true,
        matchedRuleId: null,
        aiConfidence: null,
        aiReason: null,
        jobStatus,
        jobStatusSource: jobStatus ? "MANUAL" : null,
        classifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(inboxMessages.userId, userId), inArray(inboxMessages.id, ids)))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  /** Mailnex-local read state only — Gmail's \Seen flag is never touched. */
  async setRead(userId: number, id: number, isUnread: boolean): Promise<boolean> {
    const res = await db
      .update(inboxMessages)
      .set({ isUnread, updatedAt: new Date() })
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.userId, userId)))
      .returning({ id: inboxMessages.id });
    return res.length > 0;
  }

  async countManualOverrides(userId: number): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.userId, userId), eq(inboxMessages.manualOverride, true)));
    return row?.n ?? 0;
  }

  // ---- two-phase trash ------------------------------------------------------

  /** Phase 1: hide from the list but keep every row, returning what IMAP needs. */
  async markTrashPending(userId: number, ids: number[]) {
    if (ids.length === 0) return [];
    return db
      .update(inboxMessages)
      .set({ state: "TRASH_PENDING", deleteRequestedAt: new Date(), deleteError: null, updatedAt: new Date() })
      .where(and(
        eq(inboxMessages.userId, userId),
        inArray(inboxMessages.id, ids),
        eq(inboxMessages.state, "ACTIVE"),
      ))
      .returning({
        id: inboxMessages.id,
        uid: inboxMessages.uid,
        mailbox: inboxMessages.mailbox,
        uidValidity: inboxMessages.uidValidity,
      });
  }

  /** Phase 2a: the IMAP move succeeded. */
  async markTrashed(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await db
      .update(inboxMessages)
      .set({ state: "TRASHED", deletedAt: new Date(), deleteError: null, updatedAt: new Date() })
      .where(inArray(inboxMessages.id, ids))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  /**
   * Phase 2b: the IMAP move failed. The message comes BACK into the inbox carrying
   * the reason. Nothing is ever removed from Mailnex on a failed move.
   */
  async revertTrashPending(ids: number[], error: string): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await db
      .update(inboxMessages)
      .set({ state: "ACTIVE", deleteRequestedAt: null, deleteError: error, updatedAt: new Date() })
      .where(inArray(inboxMessages.id, ids))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  /**
   * Crash recovery. Fail-open on purpose: a message wrongly shown is an annoyance,
   * a message wrongly hidden is indistinguishable from data loss.
   */
  async revertStaleTrashPending(olderThan: Date): Promise<number> {
    const res = await db
      .update(inboxMessages)
      .set({
        state: "ACTIVE",
        deleteRequestedAt: null,
        deleteError: "The delete did not complete — this email is back in your inbox.",
        updatedAt: new Date(),
      })
      .where(and(
        eq(inboxMessages.state, "TRASH_PENDING"),
        lt(inboxMessages.deleteRequestedAt, olderThan),
      ))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  // ---- retention ------------------------------------------------------------

  async purgeOldMessages(olderThan: Date): Promise<number> {
    const res = await db
      .delete(inboxMessages)
      .where(and(eq(inboxMessages.state, "ACTIVE"), lt(inboxMessages.receivedAt, olderThan)))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  async purgeTrashed(olderThan: Date): Promise<number> {
    const res = await db
      .delete(inboxMessages)
      .where(and(eq(inboxMessages.state, "TRASHED"), lt(inboxMessages.deletedAt, olderThan)))
      .returning({ id: inboxMessages.id });
    return res.length;
  }

  // ---- stats ----------------------------------------------------------------

  async stats(userId: number) {
    const activeOnly = and(eq(inboxMessages.userId, userId), eq(inboxMessages.state, "ACTIVE"));

    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        uncategorized: sql<number>`count(*) filter (where ${inboxMessages.categoryId} is null)::int`,
        unread: sql<number>`count(*) filter (where ${inboxMessages.isUnread})::int`,
        trashed: sql<number>`(select count(*)::int from ${inboxMessages}
          where ${inboxMessages.userId} = ${userId} and ${inboxMessages.state} = 'TRASHED')`,
        byRule: sql<number>`count(*) filter (where ${inboxMessages.assignmentSource} = 'RULE')::int`,
        byAi: sql<number>`count(*) filter (where ${inboxMessages.assignmentSource} = 'AI')::int`,
        byManual: sql<number>`count(*) filter (where ${inboxMessages.assignmentSource} = 'MANUAL')::int`,
      })
      .from(inboxMessages)
      .where(activeOnly);

    const byJobStatus = await db
      .select({ status: inboxMessages.jobStatus, count: sql<number>`count(*)::int` })
      .from(inboxMessages)
      // isNotNull, not ne(..., null): "x != NULL" is never true in SQL.
      .where(and(activeOnly, isNotNull(inboxMessages.jobStatus)))
      .groupBy(inboxMessages.jobStatus);

    return {
      total: totals?.total ?? 0,
      uncategorized: totals?.uncategorized ?? 0,
      unread: totals?.unread ?? 0,
      trashed: totals?.trashed ?? 0,
      byRule: totals?.byRule ?? 0,
      byAi: totals?.byAi ?? 0,
      byManual: totals?.byManual ?? 0,
      byJobStatus: byJobStatus.filter((r) => r.status !== null),
    };
  }

  // ---- sync state -----------------------------------------------------------

  async getSyncState(userId: number): Promise<InboxSyncState | null> {
    const [row] = await db.select().from(inboxSyncState).where(eq(inboxSyncState.userId, userId));
    return row ?? null;
  }

  async upsertSyncState(userId: number, patch: Partial<InboxSyncState>): Promise<InboxSyncState> {
    const [row] = await db
      .insert(inboxSyncState)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: inboxSyncState.userId,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  /**
   * The backoff gate lives in SQL so a broken account is skipped without the
   * scheduler opening a socket for it at all.
   */
  async listSyncableUserIds(now: Date): Promise<number[]> {
    const rows = await db
      .select({ userId: inboxSyncState.userId })
      .from(inboxSyncState)
      .where(and(
        eq(inboxSyncState.enabled, true),
        or(isNull(inboxSyncState.nextAttemptAt), lte(inboxSyncState.nextAttemptAt, now))!,
      ));
    return rows.map((r) => r.userId);
  }
}

export const inboxRepo = new InboxRepo();
