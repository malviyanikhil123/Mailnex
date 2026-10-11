import { describe, it, expect, vi } from "vitest";
import { APICallError } from "ai";
import { personalize, unexpectedLinks } from "./personalize.js";
import { AI_TIMEOUTS, type AiModelConfig } from "./model-factory.js";
import { mockModelFactory, failingModelFactory } from "../../test-helpers/ai.js";

// ----------------------------------------------------------------------------
// Fake model factory helpers — the models are AI SDK mocks, so every call goes
// through the real generateText()
// ----------------------------------------------------------------------------

const AI: AiModelConfig = { provider: "openai", apiKey: "sk-test-key-123456789012", model: "gpt-5.4-mini" };

// Base input used in most tests
const BASE_INPUT = {
  template: {
    subject: "Application for {{company}}",
    body: "Dear Hiring Manager,\nI am applying to {{company}} in {{location}}.\nSincerely,\n{{candidateName}}",
  },
  vars: {
    company: "Acme Corp",
    location: "New York",
    sender: { name: "Alice Smith", email: "alice@example.com" },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("personalize()", () => {
  // (a) no AI config → interpolated template, aiUsed: false, model NOT called
  it("returns interpolated template with aiUsed:false when the API key is empty", async () => {
    const factory = vi.fn();
    const result = await personalize({ ...BASE_INPUT, ai: { ...AI, apiKey: "" } }, factory);

    expect(factory).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
    expect(result.body).toContain("New York");
  });

  it("returns interpolated template with aiUsed:false when no AI config is given", async () => {
    const factory = vi.fn();
    const result = await personalize({ ...BASE_INPUT }, factory);

    expect(factory).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toContain("Acme Corp");
  });

  // (b) fake model throws → fallback, aiUsed: false
  it("falls back to interpolated template with aiUsed:false when model throws", async () => {
    const factory = failingModelFactory(new Error("Network error"));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
  });

  it("falls back when the provider rejects the key", async () => {
    const err = new APICallError({
      message: "Incorrect API key provided",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 401,
    });
    const result = await personalize({ ...BASE_INPUT, ai: AI }, failingModelFactory(err));
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  // (c) fake model returns valid JSON → aiUsed: true with personalized subject
  it("returns personalized content with aiUsed:true when model returns valid JSON", async () => {
    const personalized = {
      subject: "Excited to Join Acme Corp in New York",
      body: "Dear Hiring Team at Acme Corp,\n\nI am thrilled to apply for a position in New York.\n\nBest,\nAlice Smith",
    };
    const { factory } = mockModelFactory(JSON.stringify(personalized));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(true);
    expect(result.subject).toBe(personalized.subject);
    expect(result.body).toBe(personalized.body);
  });

  it("builds the model from the campaign's provider, key and model", async () => {
    const { factory, configs, prompts } = mockModelFactory(JSON.stringify({ subject: "S", body: "B" }));
    const ai: AiModelConfig = { provider: "anthropic", apiKey: "sk-ant-key", model: "claude-sonnet-5-5" };
    await personalize({ ...BASE_INPUT, ai, language: "Hindi" }, factory);

    expect(configs).toEqual([ai]);
    expect(prompts[0]).toContain("Acme Corp");
    expect(prompts[0]).toContain("must be written in Hindi");
    expect(prompts[0]).not.toContain("sk-ant-key");
  });

  it("bounds the request with the personalization timeout", async () => {
    const { factory, calls } = mockModelFactory(JSON.stringify({ subject: "S", body: "B" }));
    await personalize({ ...BASE_INPUT, ai: AI }, factory);
    // generateText turns `timeout` into an abort signal on the model call.
    expect(calls[0]!.abortSignal).toBeInstanceOf(AbortSignal);
    expect(AI_TIMEOUTS.PERSONALIZE_MS).toBeGreaterThan(0);
  });

  it("strips a ```json code fence before parsing", async () => {
    const { factory } = mockModelFactory("```json\n" + JSON.stringify({ subject: "S", body: "B" }) + "\n```");
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);
    expect(result).toEqual({ subject: "S", body: "B", aiUsed: true });
  });

  // (d) fake model returns malformed / non-JSON text → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns non-JSON text", async () => {
    const { factory } = mockModelFactory("Sorry, I cannot complete this request.");
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  // (e) fake model returns JSON missing required field → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns JSON missing body field", async () => {
    const { factory } = mockModelFactory(JSON.stringify({ subject: "Only subject here" }));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  it("falls back with aiUsed:false when model returns JSON missing subject field", async () => {
    const { factory } = mockModelFactory(JSON.stringify({ body: "Only body here" }));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  // extra: personalize never throws even if factory itself throws
  it("never throws — returns fallback when factory construction throws", async () => {
    const badFactory = () => {
      throw new Error("Factory exploded");
    };
    const result = await personalize({ ...BASE_INPUT, ai: AI }, badFactory);
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toContain("Acme Corp");
  });

  // (f) fake model returns empty string → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns an empty string", async () => {
    const { factory } = mockModelFactory("");
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
  });

  // (g) fake model returns whitespace-only string → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns a whitespace-only string", async () => {
    const { factory } = mockModelFactory("   \n\t  ");
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
  });

  // (h) fake model returns JSON with whitespace-only subject/body → Zod trim+min(1) fails → fallback
  it("falls back with aiUsed:false when model returns JSON with whitespace-only subject", async () => {
    const { factory } = mockModelFactory(JSON.stringify({ subject: "   ", body: "Some body text" }));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  it("falls back with aiUsed:false when model returns JSON with whitespace-only body", async () => {
    const { factory } = mockModelFactory(JSON.stringify({ subject: "Some subject", body: "   " }));
    const result = await personalize({ ...BASE_INPUT, ai: AI }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });
});

describe("personalize() link check", () => {
  const WITH_LINK = {
    ...BASE_INPUT,
    template: {
      subject: "Hello {{company}}",
      body: "Hi,\nMy work: https://alice.dev/portfolio\nSincerely,\n{{candidateName}}",
    },
  };

  it("falls back to the template when the model adds a link the template lacks", async () => {
    const { factory } = mockModelFactory(JSON.stringify({
      subject: "Hello Acme Corp",
      body: "Hi Acme team, click https://evil.example/login now.\nSincerely,\nAlice Smith",
    }));
    const result = await personalize({ ...WITH_LINK, ai: AI }, factory);
    expect(result.aiUsed).toBe(false);
    expect(result.body).not.toContain("evil.example");
    expect(result.body).toContain("https://alice.dev/portfolio");
  });

  it("also catches a bare www. link and one in the subject", async () => {
    const www = mockModelFactory(JSON.stringify({ subject: "Hi", body: "See www.evil.example" }));
    expect((await personalize({ ...WITH_LINK, ai: AI }, www.factory)).aiUsed).toBe(false);
    const subj = mockModelFactory(JSON.stringify({ subject: "Go to http://evil.example", body: "Hi" }));
    expect((await personalize({ ...WITH_LINK, ai: AI }, subj.factory)).aiUsed).toBe(false);
  });

  it("keeps the AI text when it only repeats the template's own links", async () => {
    const { factory } = mockModelFactory(JSON.stringify({
      subject: "Hello Acme Corp",
      body: "Hi Acme team in New York,\nMy work: https://alice.dev/portfolio.\nSincerely,\nAlice Smith",
    }));
    const result = await personalize({ ...WITH_LINK, ai: AI }, factory);
    expect(result.aiUsed).toBe(true);
    expect(result.body).toContain("Acme team");
  });
});

describe("unexpectedLinks()", () => {
  it("compares links case-insensitively and ignores trailing punctuation", () => {
    const tpl = { subject: "", body: "Visit https://X.io/a" };
    expect(unexpectedLinks({ subject: "", body: "visit https://x.io/a)." }, tpl)).toEqual([]);
    expect(unexpectedLinks({ subject: "", body: "https://x.io/a/../b" }, tpl)).toEqual(["https://x.io/a/../b"]);
  });
});
