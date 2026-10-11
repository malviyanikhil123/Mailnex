import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName, type SQL, type Table } from "drizzle-orm";

// Records every statement the repo issues, in order, so the queries can be checked
// without a database.
type Op = { kind: "select" | "delete"; table?: string; where: SQL };
const ops: Op[] = [];
let ownedRows: { id: number }[] = [];

vi.mock("../../db/index.js", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: async (w: SQL) => {
          ops.push({ kind: "select", where: w });
          return ownedRows;
        },
      }),
    }),
    delete: (table: Table) => ({
      where: (w: SQL) => {
        ops.push({ kind: "delete", table: getTableName(table), where: w });
        const done = Promise.resolve(undefined);
        return Object.assign(done, { returning: async () => [{ id: 7 }] });
      },
    }),
  };
  return { db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { contactsRepo } = await import("./contacts.repo.js");
const render = (w: SQL) => new PgDialect().sqlToQuery(w);

beforeEach(() => {
  ops.length = 0;
  ownedRows = [];
});

describe("contactsRepo.delete", () => {
  it("touches nothing when the contact is not the caller's", async () => {
    ownedRows = [];
    await expect(contactsRepo.delete(42, 7)).resolves.toBeNull();
    expect(ops.map((o) => o.kind)).toEqual(["select"]);
    const { sql, params } = render(ops[0]!.where);
    expect(sql).toMatch(/"id" = \$1/);
    expect(sql).toMatch(/"user_id" = \$2/);
    expect(params).toEqual([7, 42]);
  });

  it("checks ownership first, then scopes every child delete to the user", async () => {
    ownedRows = [{ id: 7 }];
    await expect(contactsRepo.delete(42, 7)).resolves.toEqual({ id: 7 });
    expect(ops.map((o) => o.kind + ":" + (o.table ?? ""))).toEqual([
      "select:",
      "delete:campaign_queue",
      "delete:email_logs",
      "delete:contacts",
    ]);
    for (const op of ops.slice(1)) {
      const { sql, params } = render(op.where);
      expect(sql).toMatch(/"user_id" = \$2/);
      expect(params).toEqual([7, 42]);
    }
  });
});
