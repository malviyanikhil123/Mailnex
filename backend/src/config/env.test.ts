import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";
describe("loadEnv", () => {
  it("parses valid env", () => {
    const e = loadEnv({ DATABASE_URL: "postgres://x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef", PORT: "4000", UPLOAD_DIR: "./uploads", NODE_ENV: "test" });
    expect(e.PORT).toBe(4000);
  });
  it("rejects short ENCRYPTION_KEY", () => {
    expect(() => loadEnv({ DATABASE_URL: "x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b", ENCRYPTION_KEY: "short" }))
      .toThrow();
  });
});

describe("env proxy has trap", () => {
  it("'in' operator returns true for known keys and false for unknown keys", () => {
    expect("PORT" in (loadEnv({ DATABASE_URL: "postgres://x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef", PORT: "4000", UPLOAD_DIR: "./uploads", NODE_ENV: "test" }))).toBe(true);
    expect("NONEXISTENT_KEY" in (loadEnv({ DATABASE_URL: "postgres://x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef", PORT: "4000", UPLOAD_DIR: "./uploads", NODE_ENV: "test" }))).toBe(false);
  });
});
