import { describe, it, expect, vi } from "vitest";
import { personalize } from "./client.js";

// ----------------------------------------------------------------------------
// Fake model factory helpers
// ----------------------------------------------------------------------------

/** Creates a modelFactory that returns a model whose generateContent resolves
 *  with a model response containing the given text. */
function makeSuccessFactory(responseText: string) {
  return (_apiKey: string) => ({
    generateContent: vi.fn().mockResolvedValue({
      response: {
        text: () => responseText,
      },
    }),
  });
}

/** Creates a modelFactory whose generateContent throws the given error. */
function makeThrowingFactory(err: Error) {
  return (_apiKey: string) => ({
    generateContent: vi.fn().mockRejectedValue(err),
  });
}

// Base input used in most tests
const BASE_INPUT = {
  template: {
    subject: "Application for {{company}}",
    body: "Dear Hiring Manager,\nI am applying to {{company}} in {{location}}.\nSincerely,\n{{candidateName}}",
  },
  vars: {
    company: "Acme Corp",
    location: "New York",
    candidate: { name: "Alice Smith", email: "alice@example.com" },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("personalize()", () => {
  // (a) empty apiKey → interpolated template, aiUsed: false, model NOT called
  it("returns interpolated template with aiUsed:false when apiKey is empty", async () => {
    const factory = vi.fn();
    const result = await personalize({ ...BASE_INPUT, apiKey: "" }, factory);

    expect(factory).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
    expect(result.body).toContain("New York");
  });

  it("returns interpolated template with aiUsed:false when apiKey is absent", async () => {
    const factory = vi.fn();
    const result = await personalize({ ...BASE_INPUT }, factory);

    expect(factory).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toContain("Acme Corp");
  });

  // (b) fake model throws → fallback, aiUsed: false
  it("falls back to interpolated template with aiUsed:false when model throws", async () => {
    const factory = makeThrowingFactory(new Error("Network error"));
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
    expect(result.body).toContain("Acme Corp");
  });

  // (c) fake model returns valid JSON → aiUsed: true with personalized subject
  it("returns personalized content with aiUsed:true when model returns valid JSON", async () => {
    const personalized = {
      subject: "Excited to Join Acme Corp in New York",
      body: "Dear Hiring Team at Acme Corp,\n\nI am thrilled to apply for a position in New York.\n\nBest,\nAlice Smith",
    };
    const factory = makeSuccessFactory(JSON.stringify(personalized));
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, factory);

    expect(result.aiUsed).toBe(true);
    expect(result.subject).toBe(personalized.subject);
    expect(result.body).toBe(personalized.body);
  });

  // (d) fake model returns malformed / non-JSON text → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns non-JSON text", async () => {
    const factory = makeSuccessFactory("Sorry, I cannot complete this request.");
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  // (e) fake model returns JSON missing required field → fallback aiUsed: false
  it("falls back with aiUsed:false when model returns JSON missing body field", async () => {
    const factory = makeSuccessFactory(JSON.stringify({ subject: "Only subject here" }));
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  it("falls back with aiUsed:false when model returns JSON missing subject field", async () => {
    const factory = makeSuccessFactory(JSON.stringify({ body: "Only body here" }));
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, factory);

    expect(result.aiUsed).toBe(false);
    expect(result.subject).toBe("Application for Acme Corp");
  });

  // extra: personalize never throws even if factory itself throws
  it("never throws — returns fallback when factory construction throws", async () => {
    const badFactory = (_key: string) => {
      throw new Error("Factory exploded");
    };
    const result = await personalize({ ...BASE_INPUT, apiKey: "test-key" }, badFactory);
    expect(result.aiUsed).toBe(false);
    expect(result.subject).toContain("Acme Corp");
  });
});
