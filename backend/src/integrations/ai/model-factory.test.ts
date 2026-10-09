import { describe, it, expect } from "vitest";
import { APICallError, RetryError } from "ai";
import { defaultModelFactory, generateAiText, verifyModelAccess, type AiModelConfig } from "./model-factory.js";
import { classifyAiError, describeAiError } from "./errors.js";
import { AI_PROVIDERS } from "./providers.js";
import { mockModelFactory, failingModelFactory } from "../../test-helpers/ai.js";

const AI: AiModelConfig = { provider: "groq", apiKey: "gsk_test", model: "llama-3.3-70b-versatile" };

function apiError(statusCode: number | undefined, responseBody = "") {
  return new APICallError({ message: "failed", url: "https://x.test", requestBodyValues: {}, statusCode, responseBody });
}

describe("defaultModelFactory", () => {
  it("builds an AI SDK model for every provider without any network call", () => {
    for (const provider of AI_PROVIDERS) {
      const model = defaultModelFactory({ provider, apiKey: "test-key", model: "some-model" });
      expect(typeof model).toBe("object");
      expect(model).toMatchObject({ modelId: "some-model" });
      expect((model as { provider: string }).provider.startsWith(provider)).toBe(true);
    }
  });
});

describe("generateAiText", () => {
  it("sends the system instructions, prompt and output limit and returns the text", async () => {
    const { factory, calls, configs } = mockModelFactory("hello");
    const text = await generateAiText(AI, { system: "Be terse.", prompt: "Say hi", maxOutputTokens: 50 }, factory);
    expect(text).toBe("hello");
    expect(configs).toEqual([AI]);
    expect(calls[0]!.maxOutputTokens).toBe(50);
    expect(calls[0]!.prompt[0]).toEqual({ role: "system", content: "Be terse." });
  });

  it("verifyModelAccess surfaces the provider's error untouched (no retries)", async () => {
    const err = apiError(401);
    await expect(verifyModelAccess(AI, failingModelFactory(err))).rejects.toBe(err);
  });
});

describe("classifyAiError", () => {
  it("sorts provider errors into the cases callers act on", () => {
    expect(classifyAiError(apiError(401)).kind).toBe("auth");
    expect(classifyAiError(apiError(403)).kind).toBe("auth");
    expect(classifyAiError(apiError(400, "API key not valid. Please pass a valid API key.")).kind).toBe("auth");
    expect(classifyAiError(apiError(404)).kind).toBe("model");
    expect(classifyAiError(apiError(400, "The model `x` does not exist")).kind).toBe("model");
    expect(classifyAiError(apiError(429)).kind).toBe("quota");
    expect(classifyAiError(apiError(503)).kind).toBe("network");
    expect(classifyAiError(apiError(undefined)).kind).toBe("network");
    expect(classifyAiError(apiError(422)).kind).toBe("unknown");
    expect(classifyAiError(new DOMException("timed out", "TimeoutError")).kind).toBe("timeout");
    expect(classifyAiError(new Error("boom")).kind).toBe("unknown");
  });

  it("looks through a RetryError to the last attempt", () => {
    const err = new RetryError({ message: "failed 3 times", reason: "maxRetriesExceeded", errors: [apiError(503), apiError(429)] });
    expect(classifyAiError(err).kind).toBe("quota");
  });

  it("describeAiError leaves out the request body", () => {
    const err = new APICallError({
      message: "failed", url: "https://x.test", requestBodyValues: { prompt: "secret prompt" }, statusCode: 500,
    });
    expect(JSON.stringify(describeAiError(err))).not.toContain("secret prompt");
  });
});
