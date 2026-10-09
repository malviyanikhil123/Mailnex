import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { loginSchema, registerSchema } from "./auth.schema.js";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe("loginSchema", () => {
  it("trims and lower-cases the email and defaults rememberMe to false", () => {
    expect(loginSchema.parse({ email: "  Jane@Example.COM ", password: "x" })).toEqual({
      email: "jane@example.com",
      password: "x",
      rememberMe: false,
    });
  });

  it("passes rememberMe through", () => {
    expect(loginSchema.parse({ email: "a@b.co", password: "x", rememberMe: true }).rememberMe).toBe(true);
  });

  it("does not apply the registration password rules, so older accounts can still sign in", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "p".repeat(100) }).success).toBe(true);
  });

  it("requires a password and a valid email", () => {
    expect(firstMessage(loginSchema.safeParse({ email: "a@b.co", password: "" }))).toBe("Password is required");
    expect(firstMessage(loginSchema.safeParse({ email: "nope", password: "x" }))).toBe("Enter a valid email");
  });
});

describe("registerSchema", () => {
  const valid = { name: "  Jane Doe ", email: "Jane@Example.com", password: "correct horse" };

  it("trims the name and normalizes the email, but never touches the password", () => {
    expect(registerSchema.parse({ ...valid, password: " spaced pw " })).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      password: " spaced pw ",
    });
  });

  it("requires at least 8 characters", () => {
    expect(firstMessage(registerSchema.safeParse({ ...valid, password: "1234567" }))).toBe(
      "Password must be at least 8 characters",
    );
  });

  it("caps the password at bcrypt's 72 bytes, counting multi-byte characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "a".repeat(72) }).success).toBe(true);
    expect(firstMessage(registerSchema.safeParse({ ...valid, password: "a".repeat(73) }))).toBe(
      "Password must be at most 72 characters",
    );
    // 25 × "€" is 25 characters but 75 bytes.
    expect(registerSchema.safeParse({ ...valid, password: "€".repeat(25) }).success).toBe(false);
  });

  it("rejects a blank or overlong name and an overlong email", () => {
    expect(firstMessage(registerSchema.safeParse({ ...valid, name: "   " }))).toBe("Name is required");
    expect(registerSchema.safeParse({ ...valid, name: "n".repeat(101) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: `${"a".repeat(250)}@b.co` }).success).toBe(false);
  });
});

describe("auth validation errors over HTTP", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns the first friendly message alongside the details", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Jane", email: "jane@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "ValidationError",
      message: "Password must be at least 8 characters",
      details: { fieldErrors: { password: ["Password must be at least 8 characters"] } },
    });
  });
});
