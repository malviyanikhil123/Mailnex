/**
 * classifyInboxJob — sorts stored mail into the user's own categories.
 *
 * Order of operations, and why:
 *   1. No categories → return immediately, touching nothing. Sorting is meaningless
 *      before the user has said what their categories are, and this is the primary
 *      gate for that requirement (the API has a second, independent one).
 *   2. Rules first. Deterministic, free, instant, and explainable.
 *   3. Only what no rule matched goes to Gemini, in batches.
 *
 * Manual assignments are never candidates, and the repo's UPDATE additionally guards
 * on manual_override = false — two layers, because silently overwriting a correction
 * the user made by hand is the one failure that would destroy trust in the feature.
 */

import { INBOX } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { matchRules, type JobStatus, type RuleLike } from "../modules/inbox/rules-engine.js";
import type { Assignment } from "../modules/inbox/inbox.repo.js";
import type { ClassifyFn } from "../integrations/gemini/classifier.js";

export interface ClassifyCategoryRow {
  id: number;
  name: string;
  description: string;
  trackSubStatus: boolean;
}

export interface ClassifyMessageRow {
  id: number;
  fromAddress: string;
  fromDomain: string;
  subject: string;
  bodyText: string;
}

export interface ClassifyInboxDeps {
  categories: { list(): Promise<ClassifyCategoryRow[]> };
  rules: {
    listEnabled(): Promise<RuleLike[]>;
    bumpMatch(ruleId: number, at: Date): Promise<void>;
  };
  messages: {
    listUnclassified(limit: number): Promise<ClassifyMessageRow[]>;
    listReclassifiable(limit: number): Promise<ClassifyMessageRow[]>;
    /** Returns false when the row was a manual pick and was therefore left alone. */
    applyAssignment(id: number, a: Assignment): Promise<boolean>;
  };
  getGeminiKey: () => Promise<string>;
  classifyMessages: ClassifyFn;
  progress?: (p: { phase: string; processed: number; total: number }) => void;
  now?: () => Date;
}

export interface ClassifyInboxResult {
  outcome: "ok" | "no_categories" | "nothing_to_do";
  examined: number;
  byRule: number;
  byAi: number;
  uncategorized: number;
  skippedManual: number;
  aiCalls: number;
}

const CANDIDATE_LIMIT = 500;

export async function classifyInboxJob(
  deps: ClassifyInboxDeps,
  opts: { mode?: "new" | "all" } = {},
): Promise<ClassifyInboxResult> {
  const now = deps.now ?? (() => new Date());
  const mode = opts.mode ?? "new";
  const base: ClassifyInboxResult = {
    outcome: "ok", examined: 0, byRule: 0, byAi: 0, uncategorized: 0, skippedManual: 0, aiCalls: 0,
  };

  const categories = await deps.categories.list();
  if (categories.length === 0) {
    return { ...base, outcome: "no_categories" };
  }

  const candidates = mode === "all"
    ? await deps.messages.listReclassifiable(CANDIDATE_LIMIT)
    : await deps.messages.listUnclassified(CANDIDATE_LIMIT);

  if (candidates.length === 0) {
    return { ...base, outcome: "nothing_to_do" };
  }

  const rules = await deps.rules.listEnabled();
  const byId = new Map(categories.map((c) => [c.id, c]));

  let byRule = 0;
  let skippedManual = 0;
  let processed = 0;
  const unmatched: ClassifyMessageRow[] = [];

  deps.progress?.({ phase: "matching rules", processed: 0, total: candidates.length });

  // ---- pass 1: rules ------------------------------------------------------
  for (const msg of candidates) {
    const hit = matchRules(msg, rules);
    if (!hit) {
      unmatched.push(msg);
      processed++;
      deps.progress?.({ phase: "matching rules", processed, total: candidates.length });
      continue;
    }

    const category = byId.get(hit.categoryId);
    if (!category) {
      // The category was deleted since the rules were loaded — treat as unmatched
      // rather than writing a foreign key that no longer resolves.
      unmatched.push(msg);
      processed++;
      continue;
    }

    const subStatus = category.trackSubStatus ? hit.subStatus : null;
    const applied = await deps.messages.applyAssignment(msg.id, {
      categoryId: category.id,
      assignmentSource: "RULE",
      matchedRuleId: hit.ruleId,
      aiConfidence: null,
      aiReason: null,
      jobStatus: subStatus,
      jobStatusSource: subStatus ? "RULE" : null,
      jobCompany: null,
      jobRole: null,
      classifiedAt: now(),
    });

    if (applied) {
      byRule++;
      await deps.rules.bumpMatch(hit.ruleId, now()).catch(() => {});
    } else {
      // The DB-level guard refused: this row is a manual pick.
      skippedManual++;
    }

    processed++;
    deps.progress?.({ phase: "matching rules", processed, total: candidates.length });
  }

  // ---- pass 2: AI on the remainder ----------------------------------------
  let byAi = 0;
  let uncategorized = 0;
  let aiCalls = 0;

  if (unmatched.length > 0) {
    deps.progress?.({ phase: "asking AI", processed, total: candidates.length });
    const apiKey = await deps.getGeminiKey();

    const result = await deps.classifyMessages({
      // Re-read per run so a rename mid-flight cannot write a stale name/id pair.
      categories: categories.map((c) => ({
        id: c.id, name: c.name, description: c.description, trackSubStatus: c.trackSubStatus,
      })),
      items: unmatched.map((m) => ({
        ref: String(m.id),
        from: m.fromAddress,
        subject: m.subject,
        text: m.bodyText,
      })),
      apiKey: apiKey || undefined,
    });
    aiCalls = result.aiCalls;

    for (const decision of result.decisions) {
      const id = Number(decision.ref);
      if (!Number.isInteger(id)) continue;

      const category = decision.categoryId !== null ? byId.get(decision.categoryId) : undefined;
      // An id the AI returned that no longer exists degrades to Uncategorized
      // rather than failing the whole run on a foreign key.
      const categoryId = category?.id ?? null;
      const tracks = category?.trackSubStatus === true;
      const subStatus = tracks ? decision.jobStatus : null;

      try {
        const applied = await deps.messages.applyAssignment(id, {
          categoryId,
          // A no-decision stays NONE so the next pass retries it once a key exists.
          assignmentSource: categoryId === null ? "NONE" : "AI",
          matchedRuleId: null,
          aiConfidence: categoryId === null ? null : decision.confidence,
          aiReason: decision.reason || null,
          jobStatus: subStatus as JobStatus | null,
          jobStatusSource: subStatus ? "AI" : null,
          jobCompany: tracks ? decision.company : null,
          jobRole: tracks ? decision.role : null,
          classifiedAt: now(),
        });

        if (!applied) skippedManual++;
        else if (categoryId === null) uncategorized++;
        else byAi++;
      } catch (err) {
        // One unwritable message must not abort the run.
        logger.warn({ messageId: id, err }, "could not store an inbox classification");
      }

      processed++;
      deps.progress?.({ phase: "asking AI", processed, total: candidates.length });
    }
  }

  deps.progress?.({ phase: "done", processed: candidates.length, total: candidates.length });

  logger.info(
    { mode, examined: candidates.length, byRule, byAi, uncategorized, aiCalls, skippedManual },
    "inbox classification finished",
  );

  return {
    outcome: "ok",
    examined: candidates.length,
    byRule,
    byAi,
    uncategorized,
    skippedManual,
    aiCalls,
  };
}

/** Exposed so the scheduler and the manual runner agree on the batch ceiling. */
export const CLASSIFY_CANDIDATE_LIMIT = CANDIDATE_LIMIT;
export const CLASSIFY_AI_CEILING = INBOX.AI_BATCH_SIZE * INBOX.AI_MAX_BATCHES_PER_RUN;
