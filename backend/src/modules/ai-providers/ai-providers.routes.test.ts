import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { aiProvidersService, type PublicAiProvider } from "./ai-providers.service.js";

const PROVIDERS: PublicAiProvider[] = [
  {
    provider: "openai", label: "OpenAI", configured: true, keyLast4: "WXYZ", defaultModel: "gpt-5.4-mini",
    isDefault: true, models: ["gpt-5.4-mini"], keyUrl: "https://platform.openai.com/api-keys", updatedAt: null,
  },
];

/**
 * AI provider routes. The service is stubbed, so no database is needed: these check
 * auth, the provider-name check and the { providers } response shape.
 */
describe("ai-providers routes (no DB required)", () => {
  let app: FastifyInstance;
  let auth: { authorization: string };

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: 7, email: "t@t.com" })}` };
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [method, url] of [
    ["GET", "/ai-providers"],
    ["PUT", "/ai-providers/openai"],
    ["POST", "/ai-providers/openai/default"],
    ["DELETE", "/ai-providers/openai"],
  ]) {
    it(`${method} ${url} returns 401 without a token`, async () => {
      const res = await app.inject({ method: method as "GET", url });
      expect(res.statusCode).toBe(401);
    });
  }

  it("GET returns every provider under `providers`", async () => {
    const list = vi.spyOn(aiProvidersService, "list").mockResolvedValue(PROVIDERS);
    const res = await app.inject({ method: "GET", url: "/ai-providers", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ providers: PROVIDERS });
    expect(list).toHaveBeenCalledWith(7);
  });

  it("PUT passes the parsed body to the service and returns { providers }", async () => {
    const save = vi.spyOn(aiProvidersService, "save").mockResolvedValue(PROVIDERS);
    const res = await app.inject({
      method: "PUT", url: "/ai-providers/openai", headers: auth,
      payload: { defaultModel: "gpt-5.5", makeDefault: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ providers: PROVIDERS });
    expect(save).toHaveBeenCalledWith(7, "openai", expect.objectContaining({ defaultModel: "gpt-5.5", makeDefault: true }));
  });

  it("POST /:provider/default and DELETE /:provider return { providers }", async () => {
    const setDefault = vi.spyOn(aiProvidersService, "setDefault").mockResolvedValue(PROVIDERS);
    const remove = vi.spyOn(aiProvidersService, "remove").mockResolvedValue(PROVIDERS);

    let res = await app.inject({ method: "POST", url: "/ai-providers/groq/default", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ providers: PROVIDERS });
    expect(setDefault).toHaveBeenCalledWith(7, "groq");

    res = await app.inject({ method: "DELETE", url: "/ai-providers/groq", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ providers: PROVIDERS });
    expect(remove).toHaveBeenCalledWith(7, "groq");
  });

  it.each([
    ["PUT", "/ai-providers/mistral"],
    ["POST", "/ai-providers/mistral/default"],
    ["DELETE", "/ai-providers/mistral"],
  ])("%s %s is a 404 for an unknown provider, without reaching the service", async (method, url) => {
    const save = vi.spyOn(aiProvidersService, "save");
    const setDefault = vi.spyOn(aiProvidersService, "setDefault");
    const remove = vi.spyOn(aiProvidersService, "remove");
    const res = await app.inject({ method: method as "PUT", url, headers: auth, payload: method === "PUT" ? { apiKey: "x" } : undefined });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/Unknown AI provider "mistral"/);
    expect(save).not.toHaveBeenCalled();
    expect(setDefault).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("PUT rejects an invalid body with 400", async () => {
    const save = vi.spyOn(aiProvidersService, "save");
    const res = await app.inject({ method: "PUT", url: "/ai-providers/openai", headers: auth, payload: { makeDefault: "yes" } });
    expect(res.statusCode).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
