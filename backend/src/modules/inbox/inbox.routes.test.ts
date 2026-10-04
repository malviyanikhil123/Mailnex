import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { dbEnabled } from "../../test-helpers/db.js";

/**
 * Inbox routes.
 *
 * The auth-guard block needs no database: it proves every route is behind a token
 * and that path params are validated before any work happens. The app is built once
 * for the block, following templates.routes.test.ts — on Windows the cold module
 * load otherwise brushes Vitest's 5s default and flakes.
 */
describe("inbox routes (auth guard, no DB required)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const unauthenticated: Array<[string, string, object?]> = [
    ["GET", "/inbox/categories"],
    ["POST", "/inbox/categories", { name: "OTP" }],
    ["PUT", "/inbox/categories/1", { name: "OTP" }],
    ["DELETE", "/inbox/categories/1"],
    ["PUT", "/inbox/categories/order", { order: [1] }],
    ["POST", "/inbox/categories/seed-defaults"],
    ["GET", "/inbox/categories/1/rules"],
    ["POST", "/inbox/categories/1/rules", { field: "SUBJECT", value: "otp" }],
    ["PUT", "/inbox/rules/1", { value: "otp" }],
    ["DELETE", "/inbox/rules/1"],
    ["POST", "/inbox/rules/test", { field: "SUBJECT", value: "otp" }],
    ["GET", "/inbox/messages"],
    ["GET", "/inbox/messages/1"],
    ["PUT", "/inbox/messages/1/category", { categoryId: null }],
    ["POST", "/inbox/messages/bulk-category", { ids: [1], categoryId: null }],
    ["POST", "/inbox/messages/1/read", { isUnread: false }],
    ["POST", "/inbox/messages/delete", { ids: [1] }],
    ["GET", "/inbox/stats"],
    ["POST", "/inbox/sync"],
    ["POST", "/inbox/classify", { mode: "new" }],
    ["GET", "/inbox/jobs/abc/progress"],
    ["GET", "/inbox/sync-state"],
    ["PUT", "/inbox/sync-state", { enabled: true }],
    ["POST", "/inbox/verify"],
  ];

  for (const [method, url, payload] of unauthenticated) {
    it(`${method} ${url} returns 401 without a token`, async () => {
      const res = await app.inject({ method: method as "GET", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }

  it("rejects a non-numeric category id with 400, not a 500", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "PUT",
      url: "/inbox/categories/abc",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid id");
  });

  it("rejects a non-numeric rule id with 400", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "DELETE",
      url: "/inbox/rules/xyz",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a negative message id with 400", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "GET",
      url: "/inbox/messages/-5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("validates the message list query and rejects an oversized limit", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "GET",
      url: "/inbox/messages?limit=5000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("ValidationError");
  });

  it("rejects a bulk move with an empty id list", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "POST",
      url: "/inbox/messages/bulk-category",
      headers: { authorization: `Bearer ${token}` },
      payload: { ids: [], categoryId: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a category colour that is not a hex value", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "POST",
      url: "/inbox/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test", color: "blue" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown job id so the UI can stop polling", async () => {
    const token = app.jwt.sign({ sub: 1, email: "t@t.com" });
    const res = await app.inject({
      method: "GET",
      url: "/inbox/jobs/does-not-exist/progress",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe.skipIf(!dbEnabled)("inbox routes integration (DB gated)", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    token = app.jwt.sign({ sub: 1, email: "test@test.com" });
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it("refuses to classify while the user has no categories", async () => {
    const { db } = await import("../../db/index.js");
    const { inboxCategories } = await import("../../db/schema/inbox.js");
    await db.delete(inboxCategories);

    const res = await app.inject({ method: "POST", url: "/inbox/classify", headers: auth(), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe("NO_CATEGORIES");
  });

  it("walks category → rule → dry-run → delete", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/inbox/categories",
      headers: auth(),
      payload: { name: "Test OTP", description: "codes", trackSubStatus: false },
    });
    expect(created.statusCode).toBe(201);
    const categoryId = JSON.parse(created.body).id;

    const dup = await app.inject({
      method: "POST", url: "/inbox/categories", headers: auth(), payload: { name: "test otp" },
    });
    expect(dup.statusCode).toBe(409);

    const rule = await app.inject({
      method: "POST",
      url: `/inbox/categories/${categoryId}/rules`,
      headers: auth(),
      payload: { field: "SUBJECT", matchType: "CONTAINS", value: "OTP" },
    });
    expect(rule.statusCode).toBe(201);
    expect(JSON.parse(rule.body).valueNormalized).toBe("otp");

    const test = await app.inject({
      method: "POST", url: "/inbox/rules/test", headers: auth(),
      payload: { field: "SUBJECT", value: "otp" },
    });
    expect(test.statusCode).toBe(200);
    expect(JSON.parse(test.body)).toHaveProperty("matches");

    const list = await app.inject({ method: "GET", url: "/inbox/categories", headers: auth() });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).categories.some((c: { id: number }) => c.id === categoryId)).toBe(true);

    const removed = await app.inject({
      method: "DELETE", url: `/inbox/categories/${categoryId}`, headers: auth(),
    });
    expect(removed.statusCode).toBe(200);
    expect(JSON.parse(removed.body).deleted).toBe(true);
  });

  it("seed-defaults is idempotent", async () => {
    const { db } = await import("../../db/index.js");
    const { inboxCategories } = await import("../../db/schema/inbox.js");
    await db.delete(inboxCategories);

    const first = await app.inject({ method: "POST", url: "/inbox/categories/seed-defaults", headers: auth() });
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.body).created).toBeGreaterThan(0);

    const second = await app.inject({ method: "POST", url: "/inbox/categories/seed-defaults", headers: auth() });
    expect(JSON.parse(second.body).created).toBe(0);
  });

  it("reports the sync state, including whether Gmail is configured", async () => {
    const res = await app.inject({ method: "GET", url: "/inbox/sync-state", headers: auth() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("gmailConfigured");
    expect(body.syncWindowDays).toBe(30);
  });
});
