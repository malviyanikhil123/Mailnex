import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";

const base = {
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "password",
  DB_DATABASE: "email_automation",
  JWT_SECRET: "a",
  JWT_REFRESH_SECRET: "b",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  PORT: "4000",
  UPLOAD_DIR: "./uploads",
  NODE_ENV: "test",
};

describe("loadEnv", () => {
  it("parses valid env and coerces numeric ports", () => {
    const e = loadEnv(base);
    expect(e.PORT).toBe(4000);
    expect(e.DB_PORT).toBe(5432);
    expect(e.DB_DATABASE).toBe("email_automation");
  });
  it("rejects short ENCRYPTION_KEY", () => {
    expect(() => loadEnv({ ...base, ENCRYPTION_KEY: "short" })).toThrow();
  });
  it("rejects missing DB_HOST", () => {
    const { DB_HOST: _omit, ...rest } = base;
    void _omit;
    expect(() => loadEnv(rest)).toThrow();
  });
});

describe("env proxy has trap", () => {
  it("'in' operator returns true for known keys and false for unknown keys", () => {
    expect("PORT" in loadEnv(base)).toBe(true);
    expect("NONEXISTENT_KEY" in loadEnv(base)).toBe(false);
  });
});
