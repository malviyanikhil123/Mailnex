/**
 * Auth routes integration tests.
 *
 * Requires a real PostgreSQL database and the admin seed.
 * Run with: RUN_DB_TESTS=1 DATABASE_URL=<real-url> npx vitest run src/modules/auth/auth.routes.test.ts
 *
 * Without RUN_DB_TESTS, the entire suite is SKIPPED (not failed) so the
 * regular CI run stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { dbEnabled } from "../../test-helpers/db.js";
import { buildApp } from "../../app.js";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

describe.skipIf(!dbEnabled)("Auth routes (integration)", () => {
  let app: FastifyInstance;

  const ADMIN_EMAIL = "admin@local";
  const ADMIN_PASSWORD = "Admin@123";

  beforeAll(async () => {
    // Seed the admin user
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db
      .insert(users)
      .values({ name: "Admin", email: ADMIN_EMAIL, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash },
      });

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    // Clean up the test admin user
    await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
    await app.close();
  });

  describe("POST /auth/login", () => {
    it("returns 200 with accessToken and refreshToken for valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { email: ADMIN_EMAIL, name: "Admin" },
      });
    });

    it("returns 401 for wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ADMIN_EMAIL, password: "WrongPassword" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid request body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "not-an-email", password: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /auth/me", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 200 with user profile when valid access token is provided", async () => {
      // First login to get a token
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        email: ADMIN_EMAIL,
        name: "Admin",
      });
    });
  });

  describe("POST /auth/refresh", () => {
    it("returns new tokens on valid refresh token", async () => {
      // Login first
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });

      const { refreshToken } = loginRes.json();

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("returns 401 for invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken: "invalid.token.here" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 200 and clears refresh token when authenticated", async () => {
      // Login first
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ message: "Logged out" });
    });
  });
});
