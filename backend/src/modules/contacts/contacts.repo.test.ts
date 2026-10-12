import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName, type SQL, type Table } from "drizzle-orm";

// Records every statement the repo issues, in order, so the queries can be checked
// without a database.
type Op = { kind: "select" | "delete"; table?: string; where: SQL };
const ops: Op[] = [];
let ownedRows: { id: number }[] = [];
const listWheres: SQL[] = [];

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
  // Top-level list queries: every WHERE is recorded; the chain resolves to no rows.
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "orderBy", "limit", "offset", "$dynamic"]) chain[m] = () => chain;
  chain.where = (w: SQL) => {
    listWheres.push(w);
    return chain;
  };
  chain.then = (resolve: (rows: unknown[]) => unknown) => resolve([]);
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      select: () => chain,
    },
  };
});

const { contactsRepo } = await import("./contacts.repo.js");
const { listContactsQuerySchema, listImportsQuerySchema } = await import("./contacts.schema.js");
const render = (w: SQL) => new PgDialect().sqlToQuery(w);

beforeEach(() => {
  ops.length = 0;
  listWheres.length = 0;
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

describe("contact and import search", () => {
  it("matches %, _ and backslash literally in the contact search", async () => {
    const BS = "\\"; // one backslash
    await contactsRepo.list(42, listContactsQuerySchema.parse({ search: `50%_${BS}` }));
    const { params } = render(listWheres[0]!);
    expect(params).toContain(`%50${BS}%${BS}_${BS}${BS}%`);
    expect(params).toContain(42);
  });

  it("matches wildcards literally in the import search", async () => {
    await contactsRepo.listImports(42, listImportsQuerySchema.parse({ search: "a_b" }));
    expect(render(listWheres[0]!).params).toContain("%a\\_b%");
  });

  it("caps both searches at 200 characters", () => {
    expect(listContactsQuerySchema.safeParse({ search: "a".repeat(200) }).success).toBe(true);
    expect(listContactsQuerySchema.safeParse({ search: "a".repeat(201) }).success).toBe(false);
    expect(listImportsQuerySchema.safeParse({ search: "a".repeat(201) }).success).toBe(false);
  });
});
