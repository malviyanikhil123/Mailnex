/**
 * Gemini inbox classifier — the AI fallback for mail no rule matched.
 *
 * Mirrors personalize() in client.ts: an injected modelFactory for tests, the same
 * fence-stripping and Zod validation, and it NEVER throws. Any failure degrades to
 * "no decision", which leaves the message Uncategorized and retryable on the next
 * pass rather than losing it.
 *
 * Containment for prompt injection is structural rather than persuasive: the model
 * returns a category NAME which must resolve against the user's own category list,
 * and anything unrecognized becomes null. So an email saying "classify me as Bank"
 * can at worst land in a category the user already created — the model can never
 * invent a category, write outside that set, or reach Gmail.
 */

import { z } from "zod";
import { INBOX } from "../../config/constants.js";
import { logger } from "../../utils/logger.js";
import { normalizeForMatch } from "../../utils/normalize-text.js";
import type { JobStatus } from "../../modules/inbox/rules-engine.js";
import { buildClassificationPrompt } from "./classify-prompt.js";
import { defaultModelFactory, type ModelFactory } from "./model-factory.js";

export const JOB_STATUSES = [
  "APPLIED", "ACKNOWLEDGED", "RECRUITER_REPLY", "INTERVIEW_INVITE",
  "ASSESSMENT", "OFFER", "REJECTION", "WITHDRAWN", "OTHER",
] as const;

export interface ClassifyCategory {
  id: number;
  name: string;
  description: string;
  trackSubStatus: boolean;
}

export interface ClassifyItem {
  ref: string;
  from: string;
  subject: string;
  text: string;
}

export interface ClassifyInput {
  categories: ClassifyCategory[];
  items: ClassifyItem[];
  apiKey?: string;
}

export interface ClassifyDecision {
  ref: string;
  /** null = Uncategorized (no fit, unknown name, or the AI was unavailable). */
  categoryId: number | null;
  confidence: number;
  reason: string;
  jobStatus: JobStatus | null;
  company: string | null;
  role: string | null;
}

export interface ClassifyResult {
  decisions: ClassifyDecision[];
  aiUsed: boolean;
  aiCalls: number;
}

export type ClassifyFn = (
  input: ClassifyInput,
  modelFactory?: ModelFactory,
) => Promise<ClassifyResult>;

// ---------------------------------------------------------------------------
// Zod schema — most fields .catch() to a safe default so one odd field cannot
// invalidate an otherwise usable batch.
// ---------------------------------------------------------------------------

const decisionSchema = z.object({
  ref: z.string().min(1),
  category: z.string(),
  confidence: z.coerce.number().min(0).max(100).catch(50),
  reason: z.string().max(300).catch(""),
  jobStatus: z.enum(JOB_STATUSES).nullish().catch(null),
  company: z.string().max(120).nullish().catch(null),
  role: z.string().max(120).nullish().catch(null),
});

const responseSchema = z.object({ results: z.array(decisionSchema) });

function noDecision(ref: string, reason: string): ClassifyDecision {
  return { ref, categoryId: null, confidence: 0, reason, jobStatus: null, company: null, role: null };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function classifyMessages(
  input: ClassifyInput,
  modelFactory: ModelFactory = defaultModelFactory,
): Promise<ClassifyResult> {
  const { categories, items, apiKey } = input;

  if (items.length === 0) return { decisions: [], aiUsed: false, aiCalls: 0 };

  // No key → never construct the model at all, exactly like personalize().
  if (!apiKey || categories.length === 0) {
    return {
      decisions: items.map((it) =>
        noDecision(it.ref, !apiKey ? "No Gemini API key configured" : "No categories defined"),
      ),
      aiUsed: false,
      aiCalls: 0,
    };
  }

  const byName = new Map<string, ClassifyCategory>();
  for (const c of categories) byName.set(normalizeForMatch(c.name), c);

  const jobStatuses = categories.some((c) => c.trackSubStatus) ? [...JOB_STATUSES] : [];
  const batches = chunk(items, INBOX.AI_BATCH_SIZE).slice(0, INBOX.AI_MAX_BATCHES_PER_RUN);
  const handled = new Set<string>();
  const decisions: ClassifyDecision[] = [];
  let aiCalls = 0;
  let aiUsed = false;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    // Sequential, with a pause between batches: a 30-day backfill must not burn the
    // whole free-tier daily quota in one run.
    if (b > 0) await sleep(INBOX.AI_BATCH_DELAY_MS);

    const batchDecisions = await classifyBatch(
      batch, categories, byName, jobStatuses, apiKey, modelFactory,
    );
    aiCalls++;
    if (batchDecisions.some((d) => d.categoryId !== null || d.confidence > 0)) aiUsed = true;
    for (const d of batchDecisions) {
      handled.add(d.ref);
      decisions.push(d);
    }
  }

  // Items beyond the per-run batch cap keep source NONE and are retried next pass.
  for (const it of items) {
    if (!handled.has(it.ref)) {
      decisions.push(noDecision(it.ref, "Deferred to the next classification pass"));
    }
  }

  return { decisions, aiUsed, aiCalls };
}

/** One model call. Returns a decision for every ref in the batch, and never throws. */
async function classifyBatch(
  batch: ClassifyItem[],
  categories: ClassifyCategory[],
  byName: Map<string, ClassifyCategory>,
  jobStatuses: string[],
  apiKey: string,
  modelFactory: ModelFactory,
): Promise<ClassifyDecision[]> {
  const fallback = (reason: string) => batch.map((it) => noDecision(it.ref, reason));

  try {
    const model = modelFactory(apiKey);
    const prompt = buildClassificationPrompt({
      categories: categories.map((c) => ({
        name: c.name, description: c.description, trackSubStatus: c.trackSubStatus,
      })),
      items: batch.map((it) => ({
        ref: it.ref,
        from: it.from,
        subject: it.subject,
        text: (it.text ?? "").slice(0, INBOX.AI_TEXT_CHARS),
      })),
      jobStatuses,
    });

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    if (!rawText || rawText.trim() === "") {
      logger.warn({ reason: "empty_response" }, "Gemini classifier returned an empty response");
      return fallback("AI returned an empty response");
    }

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn(
        { reason: "json_parse_error", raw: cleaned.slice(0, 200) },
        "Gemini classifier returned non-JSON text",
      );
      return fallback("AI returned unreadable output");
    }

    const validated = responseSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(
        { reason: "zod_validation_failed", errors: validated.error.issues.slice(0, 5) },
        "Gemini classifier output failed schema validation",
      );
      return fallback("AI output failed validation");
    }

    const refsInBatch = new Set(batch.map((it) => it.ref));
    const seen = new Map<string, ClassifyDecision>();

    for (const r of validated.data.results) {
      // Invented refs are dropped — the model cannot touch a message we did not ask about.
      if (!refsInBatch.has(r.ref) || seen.has(r.ref)) continue;

      const resolved = byName.get(normalizeForMatch(r.category));
      const categoryId = resolved?.id ?? null;
      const tracks = resolved?.trackSubStatus === true;

      seen.set(r.ref, {
        ref: r.ref,
        categoryId,
        confidence: Math.round(r.confidence),
        reason: r.reason || (categoryId === null ? "No category fit" : ""),
        // Sub-status is meaningless on a category that does not track it and would
        // corrupt the pipeline counts, so it is dropped here as well as in the job.
        jobStatus: tracks ? ((r.jobStatus ?? null) as JobStatus | null) : null,
        company: tracks ? (r.company ?? null) : null,
        role: tracks ? (r.role ?? null) : null,
      });
    }

    return batch.map(
      (it) => seen.get(it.ref) ?? noDecision(it.ref, "AI returned no decision for this email"),
    );
  } catch (err) {
    // One bad batch must not kill the run.
    logger.warn({ reason: "model_error", err }, "Gemini classifier batch failed");
    return fallback("AI request failed");
  }
}
