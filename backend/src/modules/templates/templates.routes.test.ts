import { describe, it, expect } from "vitest";
import { dbEnabled } from "../../test-helpers/db.js";

/**
 * Templates routes integration tests.
 *
 * Unit-level auth guard tests run without DB (401 path).
 * Full CRUD happy path is DB-gated.
 */
describe("templates routes (auth guard, no DB required)", () => {
  it("POST /templates returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/templates",
      payload: { name: "t", subject: "s", body: "b" },
    });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("GET /templates returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/templates" });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("GET /templates/:id returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/templates/1" });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("PUT /templates/:id returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: "PUT",
      url: "/templates/1",
      payload: { subject: "new" },
    });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("DELETE /templates/:id returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: "DELETE", url: "/templates/1" });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("POST /templates/:id/preview returns 401 without token", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/templates/1/preview",
      payload: { name: "Alice" },
    });
    expect(res.statusCode).toBe(401);

    await app.close();
  });
});

describe.skipIf(!dbEnabled)("templates routes CRUD integration (DB gated)", () => {
  it("create → list → preview → update → delete happy path", async () => {
    const { buildApp } = await import("../../app.js");
    const { db } = await import("../../db/index.js");
    const { emailTemplates } = await import("../../db/schema/templates.js");
    const { users } = await import("../../db/schema/users.js");

    const app = await buildApp();
    await app.ready();

    // Clean slate
    await db.delete(emailTemplates);

    // Get a JWT token via login
    // (assumes seeded admin or create one here)
    // For this test we verify the route structure works at high level
    // by using app.inject with a valid JWT created directly

    const token = app.jwt.sign({ sub: 1, email: "test@test.com" });

    // POST /templates — create
    const createRes = await app.inject({
      method: "POST",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "welcome",
        subject: "Hello {{name}}",
        body: "Welcome to {{company}}!",
        category: "onboarding",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeDefined();
    expect(created.version).toBe(1);
    const tplId = created.id;

    // GET /templates — list
    const listRes = await app.inject({
      method: "GET",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    // GET /templates/:id
    const getRes = await app.inject({
      method: "GET",
      url: `/templates/${tplId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).name).toBe("welcome");

    // POST /templates/:id/preview
    const previewRes = await app.inject({
      method: "POST",
      url: `/templates/${tplId}/preview`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Alice", company: "Acme" },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);
    expect(preview.subject).toBe("Hello Alice");
    expect(preview.body).toBe("Welcome to Acme!");

    // PUT /templates/:id — update (version should bump)
    const updateRes = await app.inject({
      method: "PUT",
      url: `/templates/${tplId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { subject: "Hi {{name}}" },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body);
    expect(updated.version).toBe(2);
    expect(updated.subject).toBe("Hi {{name}}");

    // DELETE /templates/:id
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/templates/${tplId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // GET after delete should 404
    const getAfterDelete = await app.inject({
      method: "GET",
      url: `/templates/${tplId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getAfterDelete.statusCode).toBe(404);

    await app.close();
  });

  it("POST /templates returns 409 on duplicate (name, category)", async () => {
    const { buildApp } = await import("../../app.js");
    const { db } = await import("../../db/index.js");
    const { emailTemplates } = await import("../../db/schema/templates.js");

    const app = await buildApp();
    await app.ready();

    await db.delete(emailTemplates);

    const token = app.jwt.sign({ sub: 1, email: "test@test.com" });

    const payload = {
      name: "dup-test",
      subject: "Sub",
      body: "Body",
      category: "general",
    };

    const first = await app.inject({
      method: "POST",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/templates",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body);
    expect(body.error).toBe("Conflict");

    await app.close();
  });
});
