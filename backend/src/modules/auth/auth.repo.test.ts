import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Captures the WHERE clause of every DELETE so the query can be checked without a database.
const deletes: SQL[] = [];
vi.mock("../../db/index.js", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) chain[m] = () => chain;
  return {
    db: {
      delete: () => ({ where: async (w: SQL) => { deletes.push(w); } }),
      select: () => chain,
    },
  };
});

const { authRepo } = await import("./auth.repo.js");

describe("authRepo.pruneSessions", () => {
  it("only deletes the given user's expired sessions", async () => {
    await authRepo.pruneSessions(42, 5);
    const { sql, params } = new PgDialect().sqlToQuery(deletes[0]);
    expect(sql).toMatch(/"user_id" = \$1/);
    expect(sql).toMatch(/"expires_at" < \$2/);
    expect(params[0]).toBe(42);
  });
});
