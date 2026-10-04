import { describe, it, expect, vi } from "vitest";
import { classifyInboxJob, type ClassifyInboxDeps, type ClassifyMessageRow } from "./classify-inbox.js";
import type { RuleLike } from "../modules/inbox/rules-engine.js";
import type { ClassifyResult } from "../integrations/gemini/classifier.js";

const CATEGORIES = [
  { id: 1, name: "OTP", description: "Codes.", trackSubStatus: false },
  { id: 2, name: "Job Applications", description: "Replies about a role.", trackSubStatus: true },
];

function msg(id: number, over: Partial<ClassifyMessageRow> = {}): ClassifyMessageRow {
  return {
    id,
    fromAddress: "noreply@example.com",
    fromDomain: "example.com",
    subject: "Hello",
    bodyText: "body",
    ...over,
  };
}

function rule(over: Partial<RuleLike> & { id: number; categoryId: number }): RuleLike {
  return {
    field: "SUBJECT", matchType: "CONTAINS", valueNormalized: "x",
    priority: 100, enabled: true, subStatus: null, ...over,
  };
}

interface Harness {
  deps: ClassifyInboxDeps;
  applyAssignment: ReturnType<typeof vi.fn>;
  classifyMessages: ReturnType<typeof vi.fn>;
  bumpMatch: ReturnType<typeof vi.fn>;
}

function harness(over: {
  categories?: typeof CATEGORIES;
  rules?: RuleLike[];
  unclassified?: ClassifyMessageRow[];
  reclassifiable?: ClassifyMessageRow[];
  apiKey?: string;
  aiResult?: ClassifyResult;
  applyReturns?: boolean | ((id: number) => boolean);
} = {}): Harness {
  const applyReturns = over.applyReturns ?? true;
  const applyAssignment = vi.fn(async (id: number) =>
    typeof applyReturns === "function" ? applyReturns(id) : applyReturns,
  );
  const classifyMessages = vi.fn(async (): Promise<ClassifyResult> =>
    over.aiResult ?? { decisions: [], aiUsed: false, aiCalls: 0 },
  );
  const bumpMatch = vi.fn(async () => {});

  const deps: ClassifyInboxDeps = {
    categories: { list: async () => over.categories ?? CATEGORIES },
    rules: { listEnabled: async () => over.rules ?? [], bumpMatch },
    messages: {
      listUnclassified: async () => over.unclassified ?? [],
      listReclassifiable: async () => over.reclassifiable ?? [],
      applyAssignment,
    },
    getGeminiKey: async () => over.apiKey ?? "test-key",
    classifyMessages: classifyMessages as unknown as ClassifyInboxDeps["classifyMessages"],
    now: () => new Date("2026-01-15T10:00:00Z"),
  };

  return { deps, applyAssignment, classifyMessages, bumpMatch };
}

describe("classifyInboxJob", () => {
  it("does nothing at all when the user has defined no categories", async () => {
    const h = harness({ categories: [], unclassified: [msg(1), msg(2)] });
    const r = await classifyInboxJob(h.deps);

    expect(r.outcome).toBe("no_categories");
    expect(r.examined).toBe(0);
    // The load-bearing assertion: no mail is touched and no AI is called before
    // the user has said what their categories are.
    expect(h.applyAssignment).not.toHaveBeenCalled();
    expect(h.classifyMessages).not.toHaveBeenCalled();
  });

  it("reports nothing_to_do when there are no candidates", async () => {
    const h = harness({ unclassified: [] });
    const r = await classifyInboxJob(h.deps);
    expect(r.outcome).toBe("nothing_to_do");
    expect(h.classifyMessages).not.toHaveBeenCalled();
  });

  it("assigns by rule and does not consult the AI for a matched message", async () => {
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" })],
      rules: [rule({ id: 7, categoryId: 1, valueNormalized: "otp" })],
    });
    const r = await classifyInboxJob(h.deps);

    expect(r.byRule).toBe(1);
    expect(r.byAi).toBe(0);
    expect(h.classifyMessages).not.toHaveBeenCalled();
    expect(h.applyAssignment).toHaveBeenCalledWith(1, expect.objectContaining({
      categoryId: 1,
      assignmentSource: "RULE",
      matchedRuleId: 7,
      aiConfidence: null,
      aiReason: null,
    }));
  });

  it("records the rule's sub-status only on a tracking category", async () => {
    const h = harness({
      unclassified: [msg(1, { subject: "Interview invitation" }), msg(2, { subject: "Your OTP" })],
      rules: [
        rule({ id: 1, categoryId: 2, valueNormalized: "interview", subStatus: "INTERVIEW_INVITE" }),
        // OTP does not track sub-status, so this rule's subStatus must be ignored.
        rule({ id: 2, categoryId: 1, valueNormalized: "otp", subStatus: "APPLIED" }),
      ],
    });
    await classifyInboxJob(h.deps);

    expect(h.applyAssignment).toHaveBeenCalledWith(1, expect.objectContaining({
      jobStatus: "INTERVIEW_INVITE", jobStatusSource: "RULE",
    }));
    expect(h.applyAssignment).toHaveBeenCalledWith(2, expect.objectContaining({
      jobStatus: null, jobStatusSource: null,
    }));
  });

  it("bumps the matched rule's counter so dead rules are visible", async () => {
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" })],
      rules: [rule({ id: 7, categoryId: 1, valueNormalized: "otp" })],
    });
    await classifyInboxJob(h.deps);
    expect(h.bumpMatch).toHaveBeenCalledWith(7, new Date("2026-01-15T10:00:00Z"));
  });

  it("sends only the unmatched messages to the AI", async () => {
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" }), msg(2, { subject: "Random mail" })],
      rules: [rule({ id: 7, categoryId: 1, valueNormalized: "otp" })],
      aiResult: {
        decisions: [{ ref: "2", categoryId: 2, confidence: 77, reason: "mentions a role", jobStatus: null, company: null, role: null }],
        aiUsed: true, aiCalls: 1,
      },
    });
    const r = await classifyInboxJob(h.deps);

    expect(h.classifyMessages).toHaveBeenCalledTimes(1);
    const sentItems = h.classifyMessages.mock.calls[0]![0].items;
    expect(sentItems.map((i: { ref: string }) => i.ref)).toEqual(["2"]);
    expect(r.byRule).toBe(1);
    expect(r.byAi).toBe(1);
    expect(r.aiCalls).toBe(1);
  });

  it("stores an AI assignment with its confidence and reason", async () => {
    const h = harness({
      unclassified: [msg(1)],
      aiResult: {
        decisions: [{ ref: "1", categoryId: 1, confidence: 91, reason: "sender is a bank", jobStatus: null, company: null, role: null }],
        aiUsed: true, aiCalls: 1,
      },
    });
    await classifyInboxJob(h.deps);
    expect(h.applyAssignment).toHaveBeenCalledWith(1, expect.objectContaining({
      categoryId: 1, assignmentSource: "AI", aiConfidence: 91, aiReason: "sender is a bank", matchedRuleId: null,
    }));
  });

  it("leaves a no-decision message as NONE so the next pass retries it", async () => {
    const h = harness({
      unclassified: [msg(1)],
      aiResult: {
        decisions: [{ ref: "1", categoryId: null, confidence: 0, reason: "No Gemini API key configured", jobStatus: null, company: null, role: null }],
        aiUsed: false, aiCalls: 0,
      },
    });
    const r = await classifyInboxJob(h.deps);

    expect(r.uncategorized).toBe(1);
    expect(r.byAi).toBe(0);
    expect(h.applyAssignment).toHaveBeenCalledWith(1, expect.objectContaining({
      categoryId: null, assignmentSource: "NONE", aiConfidence: null,
    }));
  });

  it("runs with no Gemini key without erroring", async () => {
    const h = harness({
      unclassified: [msg(1)],
      apiKey: "",
      aiResult: {
        decisions: [{ ref: "1", categoryId: null, confidence: 0, reason: "No Gemini API key configured", jobStatus: null, company: null, role: null }],
        aiUsed: false, aiCalls: 0,
      },
    });
    const r = await classifyInboxJob(h.deps);
    expect(r.outcome).toBe("ok");
    expect(h.classifyMessages.mock.calls[0]![0].apiKey).toBeUndefined();
  });

  it("mode 'all' draws from the reclassifiable set, which excludes manual picks", async () => {
    const h = harness({
      unclassified: [msg(99)],
      reclassifiable: [msg(1), msg(2)],
    });
    const r = await classifyInboxJob(h.deps, { mode: "all" });
    expect(r.examined).toBe(2);
    expect(h.applyAssignment).not.toHaveBeenCalledWith(99, expect.anything());
  });

  it("counts a refused write as a skipped manual pick rather than a success", async () => {
    // The repo guard returns false for a manual_override row.
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" })],
      rules: [rule({ id: 7, categoryId: 1, valueNormalized: "otp" })],
      applyReturns: false,
    });
    const r = await classifyInboxJob(h.deps);
    expect(r.byRule).toBe(0);
    expect(r.skippedManual).toBe(1);
  });

  it("degrades to Uncategorized when the AI returns a category that no longer exists", async () => {
    const h = harness({
      unclassified: [msg(1)],
      aiResult: {
        decisions: [{ ref: "1", categoryId: 4242, confidence: 80, reason: "r", jobStatus: null, company: null, role: null }],
        aiUsed: true, aiCalls: 1,
      },
    });
    const r = await classifyInboxJob(h.deps);
    expect(r.uncategorized).toBe(1);
    expect(h.applyAssignment).toHaveBeenCalledWith(1, expect.objectContaining({
      categoryId: null, assignmentSource: "NONE",
    }));
  });

  it("treats a rule pointing at a deleted category as unmatched instead of writing a bad FK", async () => {
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" })],
      rules: [rule({ id: 7, categoryId: 9999, valueNormalized: "otp" })],
      aiResult: {
        decisions: [{ ref: "1", categoryId: 1, confidence: 60, reason: "r", jobStatus: null, company: null, role: null }],
        aiUsed: true, aiCalls: 1,
      },
    });
    const r = await classifyInboxJob(h.deps);
    expect(r.byRule).toBe(0);
    expect(r.byAi).toBe(1);
  });

  it("survives one unwritable message without aborting the run", async () => {
    const h = harness({
      unclassified: [msg(1), msg(2)],
      aiResult: {
        decisions: [
          { ref: "1", categoryId: 1, confidence: 80, reason: "r", jobStatus: null, company: null, role: null },
          { ref: "2", categoryId: 1, confidence: 80, reason: "r", jobStatus: null, company: null, role: null },
        ],
        aiUsed: true, aiCalls: 1,
      },
    });
    h.deps.messages.applyAssignment = vi.fn(async (id: number) => {
      if (id === 1) throw new Error("foreign key violation");
      return true;
    });
    const r = await classifyInboxJob(h.deps);
    expect(r.outcome).toBe("ok");
    expect(r.byAi).toBe(1);
  });

  it("reports progress up to the candidate total", async () => {
    const seen: Array<{ phase: string; processed: number; total: number }> = [];
    const h = harness({
      unclassified: [msg(1, { subject: "Your OTP code" })],
      rules: [rule({ id: 7, categoryId: 1, valueNormalized: "otp" })],
    });
    h.deps.progress = (p) => seen.push({ ...p });
    await classifyInboxJob(h.deps);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual({ phase: "done", processed: 1, total: 1 });
  });
});
