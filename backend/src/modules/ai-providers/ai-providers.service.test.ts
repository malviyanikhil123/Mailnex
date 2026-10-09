import { describe, it, expect, vi, beforeEach } from "vitest";
import { APICallError } from "ai";
import { AiProvidersService, type VerifyKey, type GenerateFn } from "./ai-providers.service.js";
import type { IAiProvidersRepo, AiProviderKey } from "./ai-providers.repo.js";
import { verifyModelAccess, generateAiText } from "../../integrations/ai/model-factory.js";
import { mockModelFactory, failingModelFactory } from "../../test-helpers/ai.js";

const KEYS = {
  openai: "sk-proj-" + "a".repeat(36) + "WXYZ",
  anthropic: "sk-ant-api03-" + "b".repeat(40) + "Q1w2",
  google: "AIza" + "c".repeat(31) + "G00g",
  groq: "gsk_" + "d".repeat(48) + "Gr0q",
};

/** Stateful in-memory fake repo so encrypt→store→decrypt round-trips realistically. */
function makeFakeRepo(): IAiProvidersRepo & { rows: AiProviderKey[] } {
  const rows: AiProviderKey[] = [];
  let nextId = 1;
  let clock = 0;
  return {
    rows,
    async list() {
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async get(_userId, provider) {
      return rows.find((r) => r.provider === provider) ?? null;
    },
    async upsert(userId, provider, values) {
      const row = rows.find((r) => r.provider === provider);
      if (row) return Object.assign(row, values, { updatedAt: new Date() });
      const created = {
        id: nextId++, userId, provider, ...values, isDefault: false,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)), updatedAt: new Date(),
      };
      rows.push(created);
      return created;
    },
    async updateModel(_userId, provider, defaultModel) {
      const row = rows.find((r) => r.provider === provider);
      if (row) row.defaultModel = defaultModel;
    },
    async setDefault(_userId, provider) {
      for (const r of rows) r.isDefault = r.provider === provider;
    },
    async remove(_userId, provider) {
      const i = rows.findIndex((r) => r.provider === provider);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function apiError(statusCode: number | undefined, responseBody = "") {
  return new APICallError({
    message: `HTTP ${statusCode ?? "network"}`,
    url: "https://provider.example/v1",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

describe("AiProvidersService", () => {
  const userId = 1;
  let repo: ReturnType<typeof makeFakeRepo>;
  let verify: ReturnType<typeof vi.fn> & VerifyKey;
  let generate: ReturnType<typeof vi.fn> & GenerateFn;
  let service: AiProvidersService;

  beforeEach(() => {
    repo = makeFakeRepo();
    verify = vi.fn(async () => {}) as typeof verify;
    generate = vi.fn(async () => "generated text") as typeof generate;
    service = new AiProvidersService(repo, verify, generate);
  });

  // ---- listing ---------------------------------------------------------------

  it("lists every provider, unconfigured ones with their recommended model", async () => {
    const list = await service.list(userId);
    expect(list.map((p) => p.provider)).toEqual(["openai", "anthropic", "google", "groq"]);
    expect(list.every((p) => !p.configured && !p.isDefault && p.keyLast4 === null)).toBe(true);
    expect(list.find((p) => p.provider === "google")!.defaultModel).toBe("gemini-3.5-flash-lite");
    expect(list.find((p) => p.provider === "openai")!.keyUrl).toBe("https://platform.openai.com/api-keys");
  });

  // ---- saving ----------------------------------------------------------------

  it("stores a verified key encrypted and only ever exposes its last 4 characters", async () => {
    const list = await service.save(userId, "openai", { apiKey: KEYS.openai });
    expect(verify).toHaveBeenCalledWith({ provider: "openai", apiKey: KEYS.openai, model: "gpt-5.4-mini" });
    expect(repo.rows[0]!.apiKeyEnc).not.toContain(KEYS.openai);
    const openai = list.find((p) => p.provider === "openai")!;
    expect(openai).toMatchObject({ configured: true, keyLast4: "WXYZ", defaultModel: "gpt-5.4-mini" });
    expect(JSON.stringify(list)).not.toContain(KEYS.openai);
    expect(JSON.stringify(list)).not.toContain(repo.rows[0]!.apiKeyEnc);
    expect(await service.hasAny(userId)).toBe(true);
  });

  it("makes the first key the default, and keeps exactly one default", async () => {
    await service.save(userId, "google", { apiKey: KEYS.google });
    let list = await service.save(userId, "groq", { apiKey: KEYS.groq });
    expect(list.filter((p) => p.isDefault).map((p) => p.provider)).toEqual(["google"]);

    list = await service.save(userId, "anthropic", { apiKey: KEYS.anthropic, makeDefault: true });
    expect(list.filter((p) => p.isDefault).map((p) => p.provider)).toEqual(["anthropic"]);

    list = await service.setDefault(userId, "groq");
    expect(list.filter((p) => p.isDefault).map((p) => p.provider)).toEqual(["groq"]);
  });

  it.each([
    ["openai", "abc", /start with "sk-"/],
    ["openai", "sk-proj-abc def-1234567890123456", /spaces/],
    ["openai", KEYS.anthropic, /looks like a key for Anthropic Claude/],
    ["openai", "sk-short", /20–300 characters/],
    ["anthropic", "sk-" + "x".repeat(40), /looks like a key for OpenAI/],
    ["anthropic", "sk-ant-short", /40–300 characters/],
    ["google", "AIza" + "c".repeat(20), /39 characters/],
    ["google", "BIza" + "c".repeat(35), /start with "AIza"/],
    ["groq", "gsk-" + "d".repeat(52), /start with "gsk_"/],
    ["groq", KEYS.google, /looks like a key for Google Gemini/],
  ] as const)("rejects a badly formatted %s key (%s) before any network call", async (provider, key, message) => {
    await expect(service.save(userId, provider, { apiKey: key })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(message),
    });
    expect(verify).not.toHaveBeenCalled();
    expect(repo.rows).toHaveLength(0);
  });

  it("does not store a key the provider rejects (SDK mocked, real generateText)", async () => {
    service = new AiProvidersService(repo, (c) => verifyModelAccess(c, failingModelFactory(apiError(401))), generate);
    await expect(service.save(userId, "openai", { apiKey: KEYS.openai })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/The provider rejected this key/),
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("treats Google's 400 'API key not valid' as a rejected key", async () => {
    verify.mockRejectedValueOnce(apiError(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}'));
    await expect(service.save(userId, "google", { apiKey: KEYS.google })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/rejected this key/),
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("reports a model the key cannot use", async () => {
    verify.mockRejectedValueOnce(apiError(404, "model not found"));
    await expect(service.save(userId, "anthropic", { apiKey: KEYS.anthropic, defaultModel: "claude-opus-5-5" }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/does not offer the model "claude-opus-5-5"/) });
    expect(repo.rows).toHaveLength(0);
  });

  it("answers 502 and stores nothing when the provider cannot be reached", async () => {
    verify.mockRejectedValueOnce(apiError(undefined));
    await expect(service.save(userId, "groq", { apiKey: KEYS.groq })).rejects.toMatchObject({
      statusCode: 502,
      expose: true,
      message: expect.stringMatching(/Could not reach Groq/),
    });
    expect(repo.rows).toHaveLength(0);
  });

  it("answers 502 when the live check times out", async () => {
    verify.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(service.save(userId, "openai", { apiKey: KEYS.openai })).rejects.toMatchObject({ statusCode: 502 });
    expect(repo.rows).toHaveLength(0);
  });

  it("runs the live check as one tiny request with no retries", async () => {
    const { factory, calls, configs } = mockModelFactory("OK");
    service = new AiProvidersService(repo, (c) => verifyModelAccess(c, factory), generate);
    await service.save(userId, "google", { apiKey: KEYS.google, defaultModel: "gemini-3.6-flash" });
    expect(configs).toEqual([{ provider: "google", apiKey: KEYS.google, model: "gemini-3.6-flash" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.maxOutputTokens).toBe(16);
    expect(calls[0]!.abortSignal).toBeInstanceOf(AbortSignal);
    expect(repo.rows[0]!.defaultModel).toBe("gemini-3.6-flash");
  });

  it("accepts a custom model id that matches the safe pattern, and rejects others", async () => {
    await service.save(userId, "openai", { apiKey: KEYS.openai, defaultModel: "ft:gpt-5.4-mini:acme:v1" });
    expect(repo.rows[0]!.defaultModel).toBe("ft:gpt-5.4-mini:acme:v1");
    await expect(service.save(userId, "openai", { defaultModel: "bad model id!" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("changes the model without a new key: curated needs no check, custom is checked with the saved key", async () => {
    await service.save(userId, "openai", { apiKey: KEYS.openai });
    verify.mockClear();

    await service.save(userId, "openai", { defaultModel: "gpt-5.5" });
    expect(verify).not.toHaveBeenCalled();
    expect(repo.rows[0]!.defaultModel).toBe("gpt-5.5");

    await service.save(userId, "openai", { defaultModel: "gpt-7-preview" });
    expect(verify).toHaveBeenCalledWith({ provider: "openai", apiKey: KEYS.openai, model: "gpt-7-preview" });
    expect(repo.rows[0]!.defaultModel).toBe("gpt-7-preview");
  });

  it("needs a key to connect a provider for the first time", async () => {
    await expect(service.save(userId, "groq", { defaultModel: "llama-3.1-8b-instant" }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Paste an API key/) });
  });

  // ---- default / remove ------------------------------------------------------

  it("cannot make an unconfigured provider the default", async () => {
    await expect(service.setDefault(userId, "openai")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("removing the default hands the default to the oldest remaining key", async () => {
    await service.save(userId, "google", { apiKey: KEYS.google });
    await service.save(userId, "openai", { apiKey: KEYS.openai });
    await service.save(userId, "groq", { apiKey: KEYS.groq });
    const list = await service.remove(userId, "google");
    expect(list.find((p) => p.provider === "google")!.configured).toBe(false);
    expect(list.filter((p) => p.isDefault).map((p) => p.provider)).toEqual(["openai"]);
  });

  it("removing an unconfigured provider is a 404", async () => {
    await expect(service.remove(userId, "groq")).rejects.toMatchObject({ statusCode: 404 });
  });

  // ---- resolve ---------------------------------------------------------------

  it("resolves nothing when no key is saved", async () => {
    expect(await service.resolve(userId)).toBeNull();
    expect(await service.resolve(userId, { provider: "openai" })).toBeNull();
  });

  it("resolves the default provider and its saved model, or an explicit provider/model", async () => {
    await service.save(userId, "google", { apiKey: KEYS.google });
    await service.save(userId, "openai", { apiKey: KEYS.openai, defaultModel: "gpt-5.5" });

    expect(await service.resolve(userId)).toEqual({ provider: "google", apiKey: KEYS.google, model: "gemini-3.5-flash-lite" });
    expect(await service.resolve(userId, { provider: "openai", model: null })).toEqual({ provider: "openai", apiKey: KEYS.openai, model: "gpt-5.5" });
    expect(await service.resolve(userId, { provider: "openai", model: "gpt-5.4" })).toMatchObject({ model: "gpt-5.4" });
    // A model without a provider is ignored rather than paired with the wrong provider.
    expect(await service.resolve(userId, { provider: null, model: "gpt-5.4" })).toMatchObject({ provider: "google", model: "gemini-3.5-flash-lite" });
    expect(await service.resolve(userId, { provider: "groq" })).toBeNull();
  });

  it("allowedModels lists the curated models plus a saved custom one, or null when unconfigured", async () => {
    expect(await service.allowedModels(userId, "openai")).toBeNull();
    await service.save(userId, "openai", { apiKey: KEYS.openai, defaultModel: "ft:custom" });
    const models = await service.allowedModels(userId, "openai");
    expect(models).toContain("gpt-5.4-mini");
    expect(models).toContain("ft:custom");
    expect(await service.allowedModels(userId, "not-a-provider")).toBeNull();
  });

  // ---- generate (the reusable helper) ----------------------------------------

  it("generate throws a clear 400 when no provider is configured", async () => {
    await expect(service.generate(userId, { system: "s", prompt: "p" })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/No AI provider is configured/),
    });
    await service.save(userId, "google", { apiKey: KEYS.google });
    await expect(service.generate(userId, { provider: "anthropic", system: "s", prompt: "p" })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Anthropic Claude is not configured/),
    });
  });

  it("generate runs on the default provider with the given system prompt and limits", async () => {
    await service.save(userId, "google", { apiKey: KEYS.google });
    const text = await service.generate(userId, { system: "You design emails.", prompt: "A launch email", maxOutputTokens: 4000 });
    expect(text).toBe("generated text");
    expect(generate).toHaveBeenCalledWith(
      { provider: "google", apiKey: KEYS.google, model: "gemini-3.5-flash-lite" },
      expect.objectContaining({ system: "You design emails.", prompt: "A launch email", maxOutputTokens: 4000 }),
    );
  });

  it("generate goes through the real AI SDK path with a mocked model", async () => {
    await service.save(userId, "openai", { apiKey: KEYS.openai });
    const { factory, calls } = mockModelFactory("<html>hi</html>");
    service = new AiProvidersService(repo, verify, (c, r) => generateAiText(c, r, factory));
    expect(await service.generate(userId, { system: "Be brief.", prompt: "Hello" })).toBe("<html>hi</html>");
    expect(calls[0]!.prompt[0]).toEqual({ role: "system", content: "Be brief." });
  });

  it("generate maps provider failures to clear HTTP errors", async () => {
    await service.save(userId, "openai", { apiKey: KEYS.openai });
    generate.mockRejectedValueOnce(apiError(401));
    await expect(service.generate(userId, { system: "s", prompt: "p" })).rejects.toMatchObject({ statusCode: 400 });
    generate.mockRejectedValueOnce(apiError(429));
    await expect(service.generate(userId, { system: "s", prompt: "p" })).rejects.toMatchObject({ statusCode: 429 });
    generate.mockRejectedValueOnce(apiError(503));
    await expect(service.generate(userId, { system: "s", prompt: "p" })).rejects.toMatchObject({ statusCode: 502, expose: true });
  });

  it("generate rejects an unsafe model id", async () => {
    await service.save(userId, "openai", { apiKey: KEYS.openai });
    await expect(service.generate(userId, { provider: "openai", model: "../../etc", system: "s", prompt: "p" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
