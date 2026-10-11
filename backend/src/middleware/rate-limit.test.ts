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

describe("clientKey", () => {
  it("keeps IPv4 as is, also when IPv4-mapped", async () => {
    const { clientKey } = await import("./rate-limit.js");
    expect(clientKey("203.0.113.5")).toBe("203.0.113.5");
    expect(clientKey("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("keys IPv6 by its /64, however the address is written", async () => {
    const { clientKey } = await import("./rate-limit.js");
    expect(clientKey("2001:db8:1:2::a")).toBe("2001:db8:1:2::/64");
    expect(clientKey("2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey("::1")).toBe("0:0:0:0::/64");
    expect(clientKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(clientKey("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
    expect(clientKey("2001:db8:1:3::a")).not.toBe(clientKey("2001:db8:1:2::a"));
  });
});

describe("login limits behind a proxy (no DB required)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../app.js");
    app = await buildApp({ TRUST_PROXY: 1, CORS_ORIGINS: [] });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const login = (forwardedFor: string, email: string) =>
    app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-forwarded-for": forwardedFor },
      payload: { email },
    });

  it("allows 20 attempts an hour per email, from however many addresses", async () => {
    for (let i = 0; i < 20; i++) expect((await login(`198.51.100.${i}`, "Victim@Test.com")).statusCode).toBe(400);
    expect((await login("198.51.100.200", "victim@test.com")).statusCode).toBe(429);
    expect((await login("198.51.100.201", "someone-else@test.com")).statusCode).toBe(400);
  });

  it("counts every address in an IPv6 /64 as one client", async () => {
    for (let i = 0; i < 10; i++) expect((await login(`2001:db8:5:6::${i + 1}`, "v6@test.com")).statusCode).toBe(400);
    expect((await login("2001:db8:5:6:ffff::1", "v6@test.com")).statusCode).toBe(429);
    expect((await login("2001:db8:5:7::1", "v6@test.com")).statusCode).toBe(400);
  });
});

describe("failureLimiter", () => {
  async function setup() {
    const { failureLimiter } = await import("./rate-limit.js");
    let t = 0;
    const limiter = failureLimiter({
      max: 2, windowMs: 1000, maxKeys: 2, message: "slow down",
      key: (req) => (req.body as { k: string }).k,
      now: () => t,
    });
    type Hook = (req: unknown, reply: unknown) => Promise<void>;
    const check = (k: string) => (limiter.preHandler as unknown as Hook)({ body: { k } }, { header: () => undefined });
    const answer = (k: string, statusCode: number) =>
      (limiter.onResponse as unknown as Hook)({ body: { k } }, { statusCode });
    const fail = async (k: string) => {
      await check(k);
      await answer(k, 401);
    };
    return { check, answer, fail, setTime: (v: number) => { t = v; } };
  }

  it("blocks after max failures until the window ends", async () => {
    const { check, fail, setTime } = await setup();
    await fail("a");
    await fail("a");
    await expect(check("a")).rejects.toMatchObject({ statusCode: 429, message: "slow down" });
    setTime(1000);
    await expect(check("a")).resolves.toBeUndefined();
  });

  it("does not count successes or its own 429s, and a success clears the failures", async () => {
    const { check, answer, fail } = await setup();
    await fail("a");
    await answer("a", 200);
    await fail("a");
    await answer("a", 429);
    await expect(check("a")).resolves.toBeUndefined();
    await fail("a");
    await expect(check("a")).rejects.toMatchObject({ statusCode: 429 });
  });

  it("drops the oldest key past maxKeys", async () => {
    const { check, fail } = await setup();
    await fail("a");
    await fail("a");
    await fail("b");
    await fail("c");
    await expect(check("a")).resolves.toBeUndefined();
  });
});
