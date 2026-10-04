import { randomUUID } from "crypto";
import { INBOX } from "../../config/constants.js";
import { logger } from "../../utils/logger.js";
import { normalizeForMatch, toSlug } from "../../utils/normalize-text.js";
import { classifyImapError } from "../../integrations/imap/classify-imap-error.js";
import type { MailReader } from "../../integrations/imap/mail-reader.js";
import { INBOX_CATEGORY_SEED } from "../../db/seed/inbox-categories.js";
import { inboxRepo, type InboxRepo, type InboxCategory, type InboxRule } from "./inbox.repo.js";
import { matchRules, type JobStatus } from "./rules-engine.js";
import type {
  BulkSetCategoryInput, CreateCategoryInput, CreateRuleInput,
  ListMessagesQuery, TestRuleInput, UpdateCategoryInput, UpdateRuleInput,
} from "./inbox.schema.js";

function httpError(message: string, statusCode: number, code?: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

// ---------------------------------------------------------------------------
// Job progress — same in-memory pattern as contacts.service.ts importProgress.
// It is lost on restart by design; the frontend treats a 404 as "done or lost".
// ---------------------------------------------------------------------------

export interface InboxJobProgress {
  jobId: string;
  kind: "sync" | "classify";
  phase: string;
  processed: number;
  total: number;
  done: boolean;
  result?: unknown;
  error?: string;
}

export const inboxJobProgress = new Map<string, InboxJobProgress>();

/** userId → in-flight jobId, so a double-clicked button does not open a second IMAP session. */
const inboxManualRuns = new Map<number, string>();

function startJob(userId: number, kind: "sync" | "classify"): { jobId: string; fresh: boolean } {
  const existing = inboxManualRuns.get(userId);
  if (existing && inboxJobProgress.get(existing)?.done === false) {
    return { jobId: existing, fresh: false };
  }
  const jobId = randomUUID();
  inboxManualRuns.set(userId, jobId);
  inboxJobProgress.set(jobId, { jobId, kind, phase: "starting", processed: 0, total: 0, done: false });
  return { jobId, fresh: true };
}

function finishJob(userId: number, jobId: string, patch: Partial<InboxJobProgress>): void {
  const current = inboxJobProgress.get(jobId);
  if (current) inboxJobProgress.set(jobId, { ...current, ...patch, done: true });
  if (inboxManualRuns.get(userId) === jobId) inboxManualRuns.delete(userId);
  const t = setTimeout(() => inboxJobProgress.delete(jobId), 5 * 60 * 1000);
  t.unref?.();
}

export interface InboxServiceDeps {
  repo?: InboxRepo;
  getMailReader?: (userId: number) => Promise<MailReader>;
  runSync?: (userId: number, onProgress: (p: { phase: string; processed: number; total: number }) => void) => Promise<unknown>;
  runClassify?: (userId: number, mode: "new" | "all", onProgress: (p: { phase: string; processed: number; total: number }) => void) => Promise<unknown>;
}

export class InboxService {
  private repo: InboxRepo;
  private deps: InboxServiceDeps;

  constructor(deps: InboxServiceDeps = {}) {
    this.repo = deps.repo ?? inboxRepo;
    this.deps = deps;
  }

  // ---- categories -----------------------------------------------------------

  async listCategories(userId: number) {
    const categories = await this.repo.listCategories(userId);
    const stats = await this.repo.stats(userId);
    return {
      categories,
      uncategorized: { messageCount: stats.uncategorized, unreadCount: 0 },
    };
  }

  async createCategory(userId: number, input: CreateCategoryInput): Promise<InboxCategory> {
    const slug = toSlug(input.name);
    if (!slug) throw httpError("Category name must contain at least one letter or number", 400);
    return this.repo.createCategory(userId, {
      name: input.name,
      slug,
      description: input.description,
      color: input.color,
      trackSubStatus: input.trackSubStatus,
      sortOrder: input.sortOrder,
    });
  }

  async updateCategory(userId: number, id: number, input: UpdateCategoryInput): Promise<InboxCategory> {
    const patch: Record<string, unknown> = { ...input };
    if (input.name !== undefined) {
      const slug = toSlug(input.name);
      if (!slug) throw httpError("Category name must contain at least one letter or number", 400);
      patch.slug = slug;
    }
    const row = await this.repo.updateCategory(userId, id, patch);
    if (!row) throw httpError("Category not found", 404);

    // Turning tracking off leaves behind job statuses that no longer mean anything
    // and would skew the pipeline counts, so they are cleared.
    if (input.trackSubStatus === false) {
      await this.repo.clearJobStatusForCategory(userId, id);
    }
    return row;
  }

  async deleteCategory(userId: number, id: number, reassignTo: number | null) {
    const target = await this.repo.getCategory(userId, id);
    if (!target) throw httpError("Category not found", 404);

    if (reassignTo !== null) {
      if (reassignTo === id) throw httpError("Cannot reassign a category's mail to itself", 400);
      const dest = await this.repo.getCategory(userId, reassignTo);
      if (!dest) throw httpError("Reassignment target category not found", 404);
    }

    return this.repo.deleteCategory(userId, id, reassignTo);
  }

  async reorderCategories(userId: number, order: number[]) {
    return { updated: await this.repo.reorderCategories(userId, order) };
  }

  /** Idempotent: existing categories are skipped on their unique (slug, userId). */
  async seedDefaultCategories(userId: number): Promise<{ created: number }> {
    const existing = await this.repo.listCategories(userId);
    const haveSlugs = new Set(existing.map((c) => c.slug));
    let created = 0;

    for (const seed of INBOX_CATEGORY_SEED) {
      const slug = toSlug(seed.name);
      if (haveSlugs.has(slug)) continue;

      let category: InboxCategory;
      try {
        category = await this.repo.createCategory(userId, {
          name: seed.name,
          slug,
          description: seed.description,
          color: seed.color,
          trackSubStatus: seed.trackSubStatus,
          sortOrder: seed.sortOrder,
        });
      } catch (err) {
        logger.warn({ err, slug }, "skipping seed category that already exists");
        continue;
      }

      for (const rule of seed.rules) {
        try {
          await this.repo.createRule(userId, category.id, {
            field: rule.field,
            matchType: rule.matchType ?? "CONTAINS",
            value: rule.value,
            valueNormalized: normalizeForMatch(rule.value),
            priority: seed.priority,
            enabled: true,
            subStatus: rule.subStatus ?? null,
          });
        } catch {
          // A duplicate rule is harmless — the dedupe index did its job.
        }
      }
      created++;
    }
    return { created };
  }

  // ---- rules ----------------------------------------------------------------

  async listRules(userId: number, categoryId: number): Promise<InboxRule[]> {
    const category = await this.repo.getCategory(userId, categoryId);
    if (!category) throw httpError("Category not found", 404);
    return this.repo.listRules(userId, categoryId);
  }

  async createRule(userId: number, categoryId: number, input: CreateRuleInput): Promise<InboxRule> {
    const category = await this.repo.getCategory(userId, categoryId);
    if (!category) throw httpError("Category not found", 404);
    this.assertUsableRule(input.matchType ?? "CONTAINS", input.value);

    // A sub-status on a category that does not track it is meaningless data.
    const subStatus = category.trackSubStatus ? (input.subStatus ?? null) : null;

    return this.repo.createRule(userId, categoryId, {
      field: input.field,
      matchType: input.matchType ?? "CONTAINS",
      value: input.value,
      valueNormalized: normalizeForMatch(input.value),
      priority: input.priority,
      enabled: input.enabled,
      subStatus: subStatus as JobStatus | null,
    });
  }

  async updateRule(userId: number, ruleId: number, input: UpdateRuleInput): Promise<InboxRule> {
    const existing = await this.repo.getRule(userId, ruleId);
    if (!existing) throw httpError("Rule not found", 404);

    const patch: Record<string, unknown> = { ...input };
    if (input.value !== undefined) {
      this.assertUsableRule(input.matchType ?? existing.matchType, input.value);
      patch.valueNormalized = normalizeForMatch(input.value);
    } else if (input.matchType !== undefined) {
      this.assertUsableRule(input.matchType, existing.value);
    }

    if (input.subStatus !== undefined) {
      const category = await this.repo.getCategory(userId, existing.categoryId);
      patch.subStatus = category?.trackSubStatus ? (input.subStatus ?? null) : null;
    }

    const row = await this.repo.updateRule(userId, ruleId, patch);
    if (!row) throw httpError("Rule not found", 404);
    return row;
  }

  async deleteRule(userId: number, ruleId: number) {
    const ok = await this.repo.deleteRule(userId, ruleId);
    if (!ok) throw httpError("Rule not found", 404);
    return { deleted: true };
  }

  /**
   * Dry run against mail already stored. This is the feature's biggest trust lever:
   * the user sees "matches 14 of your emails" before committing a rule.
   */
  async testRule(userId: number, input: TestRuleInput) {
    this.assertUsableRule(input.matchType ?? "CONTAINS", input.value);

    const synthetic = [{
      id: -1,
      categoryId: -1,
      field: input.field,
      matchType: input.matchType ?? "CONTAINS",
      valueNormalized: normalizeForMatch(input.value),
      priority: 0,
      enabled: true,
      subStatus: null,
    }];

    const candidates = await this.repo.listAllForRuleTest(userId, 2000);
    const hits = candidates.filter((m) => matchRules(m, synthetic) !== null);

    return {
      matches: hits.length,
      scanned: candidates.length,
      sample: hits.slice(0, 5).map((m) => ({
        id: m.id,
        fromAddress: m.fromAddress,
        subject: m.subject,
        snippet: m.snippet,
        receivedAt: m.receivedAt,
        categoryId: m.categoryId,
      })),
    };
  }

  /** Reject a regex we know will never compile, rather than silently never matching. */
  private assertUsableRule(matchType: string, value: string): void {
    if (matchType !== "REGEX") return;
    try {
      new RegExp(normalizeForMatch(value), "i");
    } catch (err) {
      throw httpError(`That regular expression is not valid: ${(err as Error).message}`, 400);
    }
  }

  // ---- messages -------------------------------------------------------------

  async listMessages(userId: number, q: ListMessagesQuery) {
    const { rows, total } = await this.repo.listMessages(userId, q);
    return { messages: rows, total, page: q.page, limit: q.limit };
  }

  async getMessage(userId: number, id: number) {
    const row = await this.repo.getMessage(userId, id);
    if (!row) throw httpError("Message not found", 404);
    return row;
  }

  async setCategory(userId: number, id: number, categoryId: number | null, jobStatus: JobStatus | null) {
    const resolved = await this.resolveJobStatus(userId, categoryId, jobStatus);
    const updated = await this.repo.setManualAssignment(userId, [id], categoryId, resolved);
    if (updated === 0) throw httpError("Message not found", 404);
    return this.repo.getMessage(userId, id);
  }

  async bulkSetCategory(userId: number, input: BulkSetCategoryInput) {
    const resolved = await this.resolveJobStatus(userId, input.categoryId, input.jobStatus ?? null);
    const updated = await this.repo.setManualAssignment(userId, input.ids, input.categoryId, resolved);
    return { updated };
  }

  /** A job status only survives on a category that actually tracks one. */
  private async resolveJobStatus(
    userId: number,
    categoryId: number | null,
    jobStatus: JobStatus | null,
  ): Promise<JobStatus | null> {
    if (!jobStatus || categoryId === null) return null;
    const category = await this.repo.getCategory(userId, categoryId);
    if (!category) throw httpError("Category not found", 404);
    return category.trackSubStatus ? jobStatus : null;
  }

  async setRead(userId: number, id: number, isUnread: boolean) {
    const ok = await this.repo.setRead(userId, id, isUnread);
    if (!ok) throw httpError("Message not found", 404);
    return { updated: true };
  }

  async stats(userId: number) {
    const [stats, categories, syncState] = await Promise.all([
      this.repo.stats(userId),
      this.repo.listCategories(userId),
      this.repo.getSyncState(userId),
    ]);

    return {
      ...stats,
      byCategory: categories.map((c) => ({
        categoryId: c.id,
        name: c.name,
        color: c.color,
        trackSubStatus: c.trackSubStatus,
        count: c.messageCount,
        unread: c.unreadCount,
      })),
      lastSyncAt: syncState?.lastSyncAt ?? null,
      lastSyncStatus: syncState?.lastSyncStatus ?? "IDLE",
      lastSyncError: syncState?.lastSyncError ?? null,
    };
  }

  // ---- delete = move to Gmail Trash -----------------------------------------

  /**
   * Two-phase and DB-first, so a failed IMAP move can never lose mail:
   *   1. Flag the rows TRASH_PENDING — hidden from the list, still fully present.
   *   2. Ask IMAP to move them to the account's \Trash mailbox.
   *   3. Moved rows become TRASHED; anything else is REVERTED to ACTIVE carrying
   *      the reason, and reported back so the UI can say which ones failed.
   */
  async deleteMessages(userId: number, ids: number[]) {
    const pending = await this.repo.markTrashPending(userId, ids);
    if (pending.length === 0) {
      return { requested: ids.length, trashed: 0, failed: 0, failures: [] as Array<{ id: number; error: string }> };
    }

    const getReader = this.deps.getMailReader;
    if (!getReader) throw httpError("Inbox reading is not configured on this server", 500);

    let reader: MailReader | null = null;
    try {
      reader = await getReader(userId);
      const byMailbox = new Map<string, typeof pending>();
      for (const row of pending) {
        const list = byMailbox.get(row.mailbox) ?? [];
        list.push(row);
        byMailbox.set(row.mailbox, list);
      }

      const trashedIds: number[] = [];
      const failures: Array<{ id: number; error: string }> = [];

      for (const [mailbox, rows] of byMailbox) {
        const res = await reader.moveToTrash(rows.map((r) => r.uid), mailbox);
        const moved = new Set(res.movedUids);
        for (const row of rows) {
          if (moved.has(row.uid)) trashedIds.push(row.id);
          else failures.push({ id: row.id, error: "Gmail did not move this email to Trash." });
        }
      }

      await this.repo.markTrashed(trashedIds);
      if (failures.length > 0) {
        await this.repo.revertTrashPending(
          failures.map((f) => f.id),
          "Couldn't move to Gmail Trash — try again.",
        );
      }

      return {
        requested: ids.length,
        trashed: trashedIds.length,
        failed: failures.length,
        failures,
      };
    } catch (err) {
      // The whole IMAP attempt failed — every row goes back into the inbox.
      const classified = classifyImapError(err);
      await this.repo.revertTrashPending(pending.map((r) => r.id), classified.message);

      if (classified.code === "MAILBOX_GONE") {
        // Force a full re-scan; our UIDs may no longer mean anything.
        await this.repo.upsertSyncState(userId, { uidValidity: null, lastSeenUid: 0 });
      }

      logger.warn({ userId, code: classified.code }, "inbox trash move failed — messages restored");
      return {
        requested: ids.length,
        trashed: 0,
        failed: pending.length,
        failures: pending.map((r) => ({ id: r.id, error: classified.message })),
      };
    } finally {
      await reader?.close().catch(() => {});
    }
  }

  // ---- sync / classify jobs -------------------------------------------------

  async getSyncState(userId: number, gmailConfigured: boolean) {
    const row = await this.repo.getSyncState(userId)
      ?? await this.repo.upsertSyncState(userId, {});
    return {
      enabled: row.enabled,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      lastSyncErrorCode: row.lastSyncErrorCode,
      consecutiveFailures: row.consecutiveFailures,
      nextAttemptAt: row.nextAttemptAt,
      initialSyncDoneAt: row.initialSyncDoneAt,
      messagesFetchedLast: row.messagesFetchedLast,
      syncWindowDays: INBOX.SYNC_WINDOW_DAYS,
      gmailConfigured,
    };
  }

  async setSyncEnabled(userId: number, enabled: boolean) {
    // Re-enabling clears the backoff gate so the user does not wait out a stale penalty.
    return this.repo.upsertSyncState(userId, enabled
      ? { enabled, nextAttemptAt: null, consecutiveFailures: 0 }
      : { enabled });
  }

  /** Fire-and-forget, progress polled at GET /inbox/jobs/:jobId/progress. */
  startSync(userId: number): { jobId: string } {
    const { jobId, fresh } = startJob(userId, "sync");
    if (!fresh) return { jobId };

    const run = this.deps.runSync;
    if (!run) {
      finishJob(userId, jobId, { phase: "failed", error: "Sync is not configured on this server" });
      return { jobId };
    }

    void (async () => {
      try {
        const result = await run(userId, (p) => {
          const cur = inboxJobProgress.get(jobId);
          if (cur) inboxJobProgress.set(jobId, { ...cur, ...p });
        });
        finishJob(userId, jobId, { phase: "done", result });
      } catch (err) {
        const classified = classifyImapError(err);
        logger.error({ userId, code: classified.code }, "manual inbox sync failed");
        finishJob(userId, jobId, { phase: "failed", error: classified.message });
      }
    })();

    return { jobId };
  }

  async startClassify(userId: number, mode: "new" | "all"): Promise<{ jobId: string }> {
    // Requirement gate, enforced at the edge as well as inside the job: nothing is
    // sorted until the user has defined at least one category.
    const categoryCount = await this.repo.countCategories(userId);
    if (categoryCount === 0) {
      throw httpError("Define at least one category before sorting", 409, "NO_CATEGORIES");
    }

    const { jobId, fresh } = startJob(userId, "classify");
    if (!fresh) return { jobId };

    const run = this.deps.runClassify;
    if (!run) {
      finishJob(userId, jobId, { phase: "failed", error: "Classification is not configured on this server" });
      return { jobId };
    }

    void (async () => {
      try {
        const result = await run(userId, mode, (p) => {
          const cur = inboxJobProgress.get(jobId);
          if (cur) inboxJobProgress.set(jobId, { ...cur, ...p });
        });
        finishJob(userId, jobId, { phase: "done", result });
      } catch (err) {
        logger.error({ userId, err }, "manual inbox classify failed");
        finishJob(userId, jobId, { phase: "failed", error: "Classification failed — please try again." });
      }
    })();

    return { jobId };
  }

  getJobProgress(jobId: string): InboxJobProgress {
    const p = inboxJobProgress.get(jobId);
    if (!p) throw httpError("Job not found", 404);
    return p;
  }

  async verify(userId: number) {
    const getReader = this.deps.getMailReader;
    if (!getReader) throw httpError("Inbox reading is not configured on this server", 500);

    let reader: MailReader | null = null;
    try {
      reader = await getReader(userId);
      const identity = await reader.verify();
      return { ok: true as const, mailbox: { uidValidity: identity.uidValidity, exists: identity.exists } };
    } catch (err) {
      const classified = classifyImapError(err);
      throw httpError(classified.message, 400, classified.code);
    } finally {
      await reader?.close().catch(() => {});
    }
  }

  async countManualOverrides(userId: number) {
    return { manualOverrides: await this.repo.countManualOverrides(userId) };
  }
}

// ---------------------------------------------------------------------------
// Production wiring.
//
// Kept in this file rather than the scheduler so the HTTP endpoints work on their
// own, and imported lazily inside the closures so a module cycle is impossible
// (auth.service imports this service, and the jobs import the repo).
// ---------------------------------------------------------------------------

export async function buildMailReaderForUser(userId: number): Promise<MailReader> {
  const [{ settingsService }, { getMailReader }] = await Promise.all([
    import("../settings/settings.service.js"),
    import("../../integrations/imap/factory.js"),
  ]);

  const creds = await settingsService.getGmailCreds(userId);
  if (!creds) {
    throw Object.assign(new Error("No Gmail app password saved"), { imapCode: "NOT_CONFIGURED" });
  }
  const provider = await settingsService.getEmailProviderName(userId);
  return getMailReader({ provider, gmail: { user: creds.email, pass: creds.password } });
}

export async function runSyncForUser(
  userId: number,
  onProgress?: (p: { phase: string; processed: number; total: number }) => void,
) {
  const { syncInboxJob } = await import("../../jobs/sync-inbox.js");
  return syncInboxJob(
    {
      syncState: {
        get: () => inboxRepo.getSyncState(userId),
        upsert: (patch) => inboxRepo.upsertSyncState(userId, patch as never),
      },
      getMailReader: () => buildMailReaderForUser(userId),
      messages: {
        existingMessageIds: (since) => inboxRepo.existingMessageIds(userId, since),
        insertMany: (rows) => inboxRepo.insertManyMessages(userId, rows),
      },
      progress: onProgress,
    },
    // A user pressing "Sync now" has earned an attempt even inside a backoff window.
    { force: true },
  );
}

export async function runClassifyForUser(
  userId: number,
  mode: "new" | "all",
  onProgress?: (p: { phase: string; processed: number; total: number }) => void,
) {
  const [{ classifyInboxJob }, { classifyMessages }, { settingsService }] = await Promise.all([
    import("../../jobs/classify-inbox.js"),
    import("../../integrations/gemini/classifier.js"),
    import("../settings/settings.service.js"),
  ]);

  return classifyInboxJob(
    {
      categories: {
        list: async () =>
          (await inboxRepo.listCategories(userId)).map((c) => ({
            id: c.id, name: c.name, description: c.description, trackSubStatus: c.trackSubStatus,
          })),
      },
      rules: {
        listEnabled: () => inboxRepo.listEnabledRules(userId),
        bumpMatch: (ruleId, at) => inboxRepo.bumpRuleMatch(ruleId, at),
      },
      messages: {
        listUnclassified: (limit) => inboxRepo.listUnclassified(userId, limit),
        listReclassifiable: (limit) => inboxRepo.listReclassifiable(userId, limit),
        applyAssignment: (id, a) => inboxRepo.applyAssignment(userId, id, a),
      },
      getGeminiKey: () => settingsService.getGeminiKey(userId),
      classifyMessages,
      progress: onProgress,
    },
    { mode },
  );
}

export const inboxService = new InboxService({
  getMailReader: buildMailReaderForUser,
  runSync: (userId, onProgress) => runSyncForUser(userId, onProgress),
  runClassify: (userId, mode, onProgress) => runClassifyForUser(userId, mode, onProgress),
});
