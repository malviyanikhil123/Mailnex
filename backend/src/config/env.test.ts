import { describe, it, expect } from "vitest";
import { DEV_SECRETS, loadEnv } from "./env";

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

describe("loadEnv in production", () => {
  const prod = {
    ...base,
    NODE_ENV: "production",
    JWT_SECRET: "j".repeat(40),
    JWT_REFRESH_SECRET: "r".repeat(40),
    ENCRYPTION_KEY: "k".repeat(32),
  };

  it("accepts private secrets", () => {
    expect(loadEnv(prod).NODE_ENV).toBe("production");
  });

  it.each(["JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"] as const)("refuses the repo default %s", (key) => {
    expect(() => loadEnv({ ...prod, [key]: DEV_SECRETS[key] })).toThrow(key);
  });

  it("refuses missing secrets, which fall back to the defaults", () => {
    const { JWT_SECRET: _j, ENCRYPTION_KEY: _k, ...rest } = prod;
    void _j;
    void _k;
    expect(() => loadEnv(rest)).toThrow(/JWT_SECRET[\s\S]*ENCRYPTION_KEY|ENCRYPTION_KEY[\s\S]*JWT_SECRET/);
  });

  it("refuses short or shared JWT secrets", () => {
    expect(() => loadEnv({ ...prod, JWT_SECRET: "short" })).toThrow("at least 32");
    expect(() => loadEnv({ ...prod, JWT_REFRESH_SECRET: prod.JWT_SECRET })).toThrow("must differ");
  });

  it("still allows the defaults outside production", () => {
    const { JWT_SECRET: _j, JWT_REFRESH_SECRET: _r, ENCRYPTION_KEY: _k, ...rest } = base;
    void _j;
    void _r;
    void _k;
    expect(loadEnv({ ...rest, NODE_ENV: "development" }).JWT_SECRET).toBe(DEV_SECRETS.JWT_SECRET);
  });
});

describe("env proxy has trap", () => {
  it("'in' operator returns true for known keys and false for unknown keys", () => {
    expect("PORT" in loadEnv(base)).toBe(true);
    expect("NONEXISTENT_KEY" in loadEnv(base)).toBe(false);
  });
});

describe("TRUST_PROXY", () => {
  it("is off by default and for false / 0 / empty", () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(false);
    for (const v of ["false", "0", "", " FALSE "]) expect(loadEnv({ ...base, TRUST_PROXY: v }).TRUST_PROXY).toBe(false);
  });
  it("accepts true or a hop count", () => {
    expect(loadEnv({ ...base, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
  });
  it("rejects anything else rather than guessing", () => {
    for (const v of ["yes", "10.0.0.0/8", "-1", "1.5"]) expect(() => loadEnv({ ...base, TRUST_PROXY: v })).toThrow();
  });
});

describe("CORS_ORIGINS", () => {
  it("is empty by default", () => {
    expect(loadEnv(base).CORS_ORIGINS).toEqual([]);
  });
  it("splits, trims and drops trailing slashes and blanks", () => {
    expect(loadEnv({ ...base, CORS_ORIGINS: " https://a.example/, http://localhost:5173 ,," }).CORS_ORIGINS)
      .toEqual(["https://a.example", "http://localhost:5173"]);
  });
});
