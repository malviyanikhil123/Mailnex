import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";

describe("app", () => {
  it("health returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("CORS", () => {
  const preflight = (app: Awaited<ReturnType<typeof buildApp>>, origin: string) =>
    app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin, "access-control-request-method": "GET" },
    });

  it("reflects any origin when CORS_ORIGINS is unset (previous behaviour)", async () => {
    const app = await buildApp({ TRUST_PROXY: false, CORS_ORIGINS: [] });
    const res = await preflight(app, "https://anything.example");
    expect(res.headers["access-control-allow-origin"]).toBe("https://anything.example");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });

  it("allows only the listed origins when CORS_ORIGINS is set", async () => {
    const app = await buildApp({ TRUST_PROXY: false, CORS_ORIGINS: ["https://app.example"] });
    const ok = await preflight(app, "https://app.example");
    expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example");
    const bad = await preflight(app, "https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});

describe("trust proxy", () => {
  const login = (app: Awaited<ReturnType<typeof buildApp>>, forwardedFor: string) =>
    app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-forwarded-for": forwardedFor },
      // Invalid on purpose: the limit applies before validation, so no DB is reached.
      payload: { email: "proxy@test.com" },
    });

  it("ignores X-Forwarded-For when off, so a spoofed header cannot reset the limit", async () => {
    const app = await buildApp({ TRUST_PROXY: false, CORS_ORIGINS: [] });
    for (let i = 0; i < 10; i++) expect((await login(app, `10.0.0.${i}`)).statusCode).toBe(400);
    expect((await login(app, "10.0.0.99")).statusCode).toBe(429);
    await app.close();
  });

  it("keys on the forwarded client address when on", async () => {
    const app = await buildApp({ TRUST_PROXY: 1, CORS_ORIGINS: [] });
    for (let i = 0; i < 10; i++) expect((await login(app, "203.0.113.5")).statusCode).toBe(400);
    expect((await login(app, "203.0.113.5")).statusCode).toBe(429);
    expect((await login(app, "203.0.113.6")).statusCode).toBe(400);
    await app.close();
  });
});
