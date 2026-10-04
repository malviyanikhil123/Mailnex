import { describe, it, expect, vi } from "vitest";
import { classifyMessages, type ClassifyCategory, type ClassifyItem } from "./classifier.js";
import { INBOX } from "../../config/constants.js";
import type { ModelFactory } from "./model-factory.js";

const categories: ClassifyCategory[] = [
  { id: 1, name: "OTP", description: "Codes.", trackSubStatus: false },
  { id: 2, name: "Job Applications", description: "Replies about a role.", trackSubStatus: true },
];

function items(n: number): ClassifyItem[] {
  return Array.from({ length: n }, (_, i) => ({
    ref: `m${i + 1}`, from: "a@b.com", subject: `Subject ${i + 1}`, text: "body",
  }));
}

/** Builds a modelFactory that returns the given raw text, and records its calls. */
function factoryReturning(text: string | ((prompt: string) => string)) {
  const generateContent = vi.fn(async (prompt: string) => ({
    response: { text: () => (typeof text === "function" ? text(prompt) : text) },
  }));
  const factory = vi.fn((_key: string) => ({ generateContent })) as unknown as ModelFactory;
  return { factory: factory as ModelFactory, generateContent, factorySpy: factory as unknown as ReturnType<typeof vi.fn> };
}

const okResponse = (refs: string[], category = "OTP") =>
  JSON.stringify({
    results: refs.map((ref) => ({ ref, category, confidence: 88, reason: "subject has a code" })),
  });

describe("classifyMessages", () => {
  it("returns nothing for an empty item list without calling the model", () => {
    const { factory, factorySpy } = factoryReturning("{}");
    return classifyMessages({ categories, items: [], apiKey: "k" }, factory).then((r) => {
      expect(r.decisions).toEqual([]);
      expect(r.aiUsed).toBe(false);
      expect(factorySpy).not.toHaveBeenCalled();
    });
  });

  it("never constructs the model when there is no API key", async () => {
    const { factory, factorySpy } = factoryReturning("{}");
    const r = await classifyMessages({ categories, items: items(3) }, factory);
    expect(factorySpy).not.toHaveBeenCalled();
    expect(r.aiUsed).toBe(false);
    expect(r.aiCalls).toBe(0);
    expect(r.decisions).toHaveLength(3);
    expect(r.decisions.every((d) => d.categoryId === null)).toBe(true);
    expect(r.decisions[0]!.reason).toMatch(/no gemini api key/i);
  });

  it("never constructs the model when the user has no categories", async () => {
    const { factory, factorySpy } = factoryReturning("{}");
    const r = await classifyMessages({ categories: [], items: items(2), apiKey: "k" }, factory);
    expect(factorySpy).not.toHaveBeenCalled();
    expect(r.decisions.every((d) => d.categoryId === null)).toBe(true);
  });

  it("resolves a category name to its id", async () => {
    const { factory } = factoryReturning(okResponse(["m1"]));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]).toMatchObject({ ref: "m1", categoryId: 1, confidence: 88 });
    expect(r.aiUsed).toBe(true);
    expect(r.aiCalls).toBe(1);
  });

  it("resolves the name case-insensitively", async () => {
    const { factory } = factoryReturning(okResponse(["m1"], "otp"));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBe(1);
  });

  it("strips a ```json code fence before parsing", async () => {
    const { factory } = factoryReturning("```json\n" + okResponse(["m1"]) + "\n```");
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBe(1);
  });

  it("falls back to no-decision on non-JSON output", async () => {
    const { factory } = factoryReturning("I think this is an OTP email.");
    const r = await classifyMessages({ categories, items: items(2), apiKey: "k" }, factory);
    expect(r.decisions.every((d) => d.categoryId === null)).toBe(true);
    expect(r.decisions[0]!.reason).toMatch(/unreadable/i);
  });

  it("falls back on an empty response", async () => {
    const { factory } = factoryReturning("   ");
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBeNull();
    expect(r.decisions[0]!.reason).toMatch(/empty/i);
  });

  it("falls back when the JSON does not match the schema", async () => {
    const { factory } = factoryReturning(JSON.stringify({ notResults: [] }));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBeNull();
    expect(r.decisions[0]!.reason).toMatch(/validation/i);
  });

  it("does not throw when the model itself throws", async () => {
    const generateContent = vi.fn(async () => { throw new Error("503 overloaded"); });
    const factory = (() => ({ generateContent })) as unknown as ModelFactory;
    const r = await classifyMessages({ categories, items: items(2), apiKey: "k" }, factory);
    expect(r.decisions).toHaveLength(2);
    expect(r.decisions.every((d) => d.categoryId === null)).toBe(true);
    expect(r.decisions[0]!.reason).toMatch(/failed/i);
  });

  it("maps an unknown category name to Uncategorized — the AI cannot invent a bucket", async () => {
    const { factory } = factoryReturning(okResponse(["m1"], "Crypto Scams"));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBeNull();
  });

  it("maps a literal Uncategorized answer to null", async () => {
    const { factory } = factoryReturning(okResponse(["m1"], "Uncategorized"));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBeNull();
  });

  it("synthesizes a decision for a ref the model omitted", async () => {
    const { factory } = factoryReturning(okResponse(["m1"]));
    const r = await classifyMessages({ categories, items: items(2), apiKey: "k" }, factory);
    const m2 = r.decisions.find((d) => d.ref === "m2")!;
    expect(m2.categoryId).toBeNull();
    expect(m2.reason).toMatch(/no decision/i);
  });

  it("drops a ref the model invented", async () => {
    const { factory } = factoryReturning(okResponse(["m1", "ghost-ref"]));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions.map((d) => d.ref)).toEqual(["m1"]);
  });

  it("returns exactly one decision per requested item", async () => {
    const { factory } = factoryReturning(okResponse(["m1", "m1", "m2"]));
    const r = await classifyMessages({ categories, items: items(2), apiKey: "k" }, factory);
    expect(r.decisions.map((d) => d.ref).sort()).toEqual(["m1", "m2"]);
  });

  it("keeps jobStatus only for a category that tracks it", async () => {
    const { factory } = factoryReturning(JSON.stringify({
      results: [
        { ref: "m1", category: "Job Applications", confidence: 90, reason: "r", jobStatus: "INTERVIEW_INVITE", company: "Acme", role: "SDE" },
        { ref: "m2", category: "OTP", confidence: 90, reason: "r", jobStatus: "INTERVIEW_INVITE", company: "Acme", role: "SDE" },
      ],
    }));
    const r = await classifyMessages({ categories, items: items(2), apiKey: "k" }, factory);
    const m1 = r.decisions.find((d) => d.ref === "m1")!;
    const m2 = r.decisions.find((d) => d.ref === "m2")!;
    expect(m1).toMatchObject({ categoryId: 2, jobStatus: "INTERVIEW_INVITE", company: "Acme", role: "SDE" });
    // OTP does not track sub-status, so this data is dropped rather than corrupting the pipeline counts.
    expect(m2).toMatchObject({ categoryId: 1, jobStatus: null, company: null, role: null });
  });

  it("coerces an out-of-range confidence instead of rejecting the batch", async () => {
    const { factory } = factoryReturning(JSON.stringify({
      results: [{ ref: "m1", category: "OTP", confidence: 999, reason: "r" }],
    }));
    const r = await classifyMessages({ categories, items: items(1), apiKey: "k" }, factory);
    expect(r.decisions[0]!.categoryId).toBe(1);
    expect(r.decisions[0]!.confidence).toBe(50);
  });

  it("splits items into batches of AI_BATCH_SIZE", async () => {
    const n = INBOX.AI_BATCH_SIZE * 3;
    const { factory, generateContent } = factoryReturning((prompt) => {
      const refs = [...prompt.matchAll(/ref: (m\d+) ---/g)].map((m) => m[1]!);
      return okResponse(refs);
    });
    const r = await classifyMessages({ categories, items: items(n), apiKey: "k" }, factory);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(r.aiCalls).toBe(3);
    expect(r.decisions).toHaveLength(n);
    expect(r.decisions.every((d) => d.categoryId === 1)).toBe(true);
  }, 20_000);

  it("stops at AI_MAX_BATCHES_PER_RUN and defers the rest to the next pass", async () => {
    const over = INBOX.AI_BATCH_SIZE * (INBOX.AI_MAX_BATCHES_PER_RUN + 2);
    const { factory, generateContent } = factoryReturning((prompt) => {
      const refs = [...prompt.matchAll(/ref: (m\d+) ---/g)].map((m) => m[1]!);
      return okResponse(refs);
    });
    const r = await classifyMessages({ categories, items: items(over), apiKey: "k" }, factory);
    expect(generateContent).toHaveBeenCalledTimes(INBOX.AI_MAX_BATCHES_PER_RUN);
    expect(r.decisions).toHaveLength(over);
    const deferred = r.decisions.filter((d) => /deferred/i.test(d.reason));
    expect(deferred).toHaveLength(over - INBOX.AI_BATCH_SIZE * INBOX.AI_MAX_BATCHES_PER_RUN);
    expect(deferred.every((d) => d.categoryId === null)).toBe(true);
  }, 30_000);

  it("truncates each item's text to AI_TEXT_CHARS in the prompt", async () => {
    let seen = "";
    const { factory } = factoryReturning((prompt) => { seen = prompt; return okResponse(["m1"]); });
    await classifyMessages(
      { categories, items: [{ ref: "m1", from: "a@b.com", subject: "s", text: "z".repeat(5000) }], apiKey: "k" },
      factory,
    );
    // Longest run, not the first: the word "Uncategorized" in the output format
    // block also contains a z.
    const longest = Math.max(...[...seen.matchAll(/z+/g)].map((m) => m[0].length));
    expect(longest).toBe(INBOX.AI_TEXT_CHARS);
  });

  it("does not leak the API key into the prompt", async () => {
    let seen = "";
    const { factory } = factoryReturning((prompt) => { seen = prompt; return okResponse(["m1"]); });
    await classifyMessages({ categories, items: items(1), apiKey: "super-secret-key" }, factory);
    expect(seen).not.toContain("super-secret-key");
  });
});
