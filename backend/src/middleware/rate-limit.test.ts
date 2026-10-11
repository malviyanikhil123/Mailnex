import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Per-route limits. Every request below is invalid on purpose: the limit runs before
 * validation and the handler, so no database, AI provider or Gmail login is reached.
 */
describe("per-route rate limits (no DB required)", () => {
  let app: FastifyInstance;
  const bearer = (sub: number) => ({ authorization: `Bearer ${app.jwt.sign({ sub, email: "r@test.com" })}` });

  beforeAll(async () => {
    const { buildApp } = await import("../app.js");
    app = await buildApp({ TRUST_PROXY: false, CORS_ORIGINS: [] });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  for (const route of ["login", "register"]) {
    it(`POST /auth/${route} allows 10 a minute per IP and email`, async () => {
      const send = (email: string) => app.inject({ method: "POST", url: `/auth/${route}`, payload: { email } });
      for (let i = 0; i < 10; i++) expect((await send(`Brute-${route}@Test.com`)).statusCode).toBe(400);
      // The email is compared lower-cased and trimmed.
      expect((await send(` brute-${route}@test.com `)).statusCode).toBe(429);
      // Another email from the same IP has its own budget (the global limit still applies).
      expect((await send(`other-${route}@test.com`)).statusCode).toBe(400);
    });
  }

  it("login and register count separately", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email: "brute-login@test.com" } });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /ai-providers/:provider allows 5 a minute per user", async () => {
    const send = (sub: number) => app.inject({ method: "PUT", url: "/ai-providers/nope", headers: bearer(sub), payload: {} });
    for (let i = 0; i < 5; i++) expect((await send(501)).statusCode).toBe(404);
    expect((await send(501)).statusCode).toBe(429);
    expect((await send(502)).statusCode).toBe(404);
  });

  it("sender create and update each allow 5 a minute per user", async () => {
    const create = (sub: number) => app.inject({ method: "POST", url: "/senders", headers: bearer(sub), payload: {} });
    const update = (sub: number) => app.inject({ method: "PATCH", url: "/senders/1", headers: bearer(sub), payload: { appPassword: 1 } });
    for (let i = 0; i < 5; i++) expect((await create(601)).statusCode).toBe(400);
    expect((await create(601)).statusCode).toBe(429);
    for (let i = 0; i < 5; i++) expect((await update(601)).statusCode).toBe(400);
    expect((await update(601)).statusCode).toBe(429);
    expect((await create(602)).statusCode).toBe(400);
  });

  it("still requires a token before counting", async () => {
    const res = await app.inject({ method: "POST", url: "/senders", payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
