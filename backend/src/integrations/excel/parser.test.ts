import { describe, it, expect, vi, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import ExcelJS from "exceljs";
import { parseContactsXlsx, customFieldKey, IMPORT_LIMITS, type ParsedContact } from "./parser.js";

const tmpFiles: string[] = [];

async function xlsx(rows: unknown[][]): Promise<string> {
  const file = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const row of rows) ws.addRow(row);
  await wb.xlsx.writeFile(file);
  tmpFiles.push(file);
  return file;
}

async function csv(text: string): Promise<string> {
  const file = path.join(os.tmpdir(), `${crypto.randomUUID()}.csv`);
  await fs.writeFile(file, text, "utf8");
  tmpFiles.push(file);
  return file;
}

async function parse(file: string, options?: { maxRows?: number }) {
  const rows: ParsedContact[] = [];
  const result = await parseContactsXlsx(file, (row) => rows.push(row), options);
  return { rows, ...result };
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((f) => fs.unlink(f).catch(() => {})));
});

describe("parseContactsXlsx", () => {
  it("reads 3 rows from a fixture xlsx", async () => {
    const file = await xlsx([
      ["companyName", "location", "email"],
      ["Acme Inc", "New York", "alice@acme.com"],
      ["Globex", "LA", "bob@globex.com"],
      ["Initech", "Austin", "charlie@initech.com"],
    ]);

    const { rows, total, skipped, customFieldKeys } = await parse(file);

    expect(total).toBe(3);
    expect(skipped).toBe(0);
    expect(customFieldKeys).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      email: "alice@acme.com",
      firstName: null,
      lastName: null,
      companyName: "Acme Inc",
      phone: null,
      website: null,
      location: "New York",
      customFields: {},
    });
    expect(rows[1].email).toBe("bob@globex.com");
    expect(rows[2].email).toBe("charlie@initech.com");
  });

  it("lowercases email values", async () => {
    const file = await xlsx([
      ["companyName", "location", "email"],
      ["Test Co", "London", "Test@EXAMPLE.COM"],
    ]);
    const { rows } = await parse(file);
    expect(rows[0].email).toBe("test@example.com");
  });

  it("needs only an email column; everything else is optional", async () => {
    const file = await xlsx([["email"], ["only@email.com"]]);
    const { rows } = await parse(file);
    expect(rows).toEqual([
      {
        email: "only@email.com",
        firstName: null,
        lastName: null,
        companyName: null,
        phone: null,
        website: null,
        location: null,
        customFields: {},
      },
    ]);
  });

  it("matches header aliases ignoring case, spaces, underscores and punctuation", async () => {
    const file = await xlsx([
      ["FIRST_NAME", "last name", "E-Mail Address", "Organisation", "Mobile No.", "Web Site", "City"],
      ["Ada", "Lovelace", "ada@engines.io", "Analytical Engines", "+44 20 1234", "engines.io", "London"],
    ]);
    const { rows, customFieldKeys } = await parse(file);
    expect(customFieldKeys).toEqual([]);
    expect(rows[0]).toMatchObject({
      email: "ada@engines.io",
      firstName: "Ada",
      lastName: "Lovelace",
      companyName: "Analytical Engines",
      phone: "+44 20 1234",
      website: "engines.io",
      location: "London",
    });
  });

  it("recognizes generic company, phone, website and location headers", async () => {
    const file = await xlsx([
      ["Business", "Telephone", "URL", "Country", "Email"],
      ["Corner Bakery", "555-0100", "https://bakery.example", "Canada", "hi@bakery.example"],
    ]);
    const { rows } = await parse(file);
    expect(rows[0]).toMatchObject({
      companyName: "Corner Bakery",
      phone: "555-0100",
      website: "https://bakery.example",
      location: "Canada",
    });
  });

  it("prefers patterns that name the field over the company (Business Phone, Company Address)", async () => {
    const file = await xlsx([
      ["Business Phone", "Company Address", "Company Website", "Work Email", "Company Name"],
      ["555-0100", "1 Main St", "acme.example", "a@acme.example", "Acme"],
    ]);
    const { rows } = await parse(file);
    expect(rows[0]).toMatchObject({
      email: "a@acme.example",
      phone: "555-0100",
      location: "1 Main St",
      website: "acme.example",
      companyName: "Acme",
    });
  });

  it("an exact email header wins over an earlier column that merely mentions email", async () => {
    const file = await xlsx([
      ["Email status", "Email"],
      ["verified", "real@x.io"],
    ]);
    const { rows, customFieldKeys } = await parse(file);
    expect(rows[0].email).toBe("real@x.io");
    expect(customFieldKeys).toEqual(["email_status"]);
    expect(rows[0].customFields).toEqual({ email_status: "verified" });
  });

  it("splits a full name column into first and last name", async () => {
    const file = await xlsx([
      ["Name", "Email"],
      ["Ada King Lovelace", "ada@x.io"],
      ["Hopper, Grace", "grace@x.io"],
      ["Cher", "cher@x.io"],
      ["", "nobody@x.io"],
    ]);
    const { rows } = await parse(file);
    expect(rows.map((r) => [r.firstName, r.lastName])).toEqual([
      ["Ada", "King Lovelace"],
      ["Grace", "Hopper"],
      ["Cher", null],
      [null, null],
    ]);
  });

  it("uses separate first/last name columns over a full name column", async () => {
    const file = await xlsx([
      ["Full Name", "First Name", "Last Name", "Email"],
      ["Ada Lovelace", "Augusta", "King", "ada@x.io"],
      ["Grace Hopper", "", "", "grace@x.io"],
    ]);
    const { rows, customFieldKeys } = await parse(file);
    expect(customFieldKeys).toEqual([]);
    expect([rows[0].firstName, rows[0].lastName]).toEqual(["Augusta", "King"]);
    // Blank first/last cells fall back to splitting the full name.
    expect([rows[1].firstName, rows[1].lastName]).toEqual(["Grace", "Hopper"]);
  });

  it("stores every other column as a custom field under a normalized key", async () => {
    const file = await xlsx([
      ["Email", "Job Title", "Industry", "Région", "Notes!!", "Industry", ""],
      ["a@x.io", "CTO", "Fintech", "Québec", "  met at   expo ", "Banking", "loose value"],
      ["b@x.io", "", "Retail", "", "", "", ""],
    ]);
    const { rows, customFieldKeys } = await parse(file);
    expect(customFieldKeys).toEqual(["job_title", "industry", "region", "notes", "industry_2", "column_7"]);
    expect(rows[0].customFields).toEqual({
      job_title: "CTO",
      industry: "Fintech",
      region: "Québec",
      notes: "met at expo",
      industry_2: "Banking",
      column_7: "loose value",
    });
    // Same keys on every row, blank where the row has no value.
    expect(rows[1].customFields).toEqual({
      job_title: "",
      industry: "Retail",
      region: "",
      notes: "",
      industry_2: "",
      column_7: "",
    });
  });

  it("ignores empty columns", async () => {
    const file = await xlsx([
      ["Email", "", "Plan"],
      ["a@x.io", "", "Pro"],
    ]);
    const { customFieldKeys } = await parse(file);
    expect(customFieldKeys).toEqual(["plan"]);
  });

  it("caps custom columns, key length and value length", async () => {
    const extra = Array.from({ length: IMPORT_LIMITS.MAX_CUSTOM_FIELDS + 5 }, (_, i) => `Extra ${i + 1}`);
    const longHeader = "A very long column header that goes on and on and on";
    const file = await xlsx([
      ["Email", longHeader, ...extra],
      ["a@x.io", "x".repeat(IMPORT_LIMITS.MAX_VALUE_LENGTH + 100), ...extra.map(() => "v")],
    ]);
    const { rows, customFieldKeys } = await parse(file);

    expect(customFieldKeys).toHaveLength(IMPORT_LIMITS.MAX_CUSTOM_FIELDS);
    expect(customFieldKeys[0]).toBe(customFieldKey(longHeader));
    expect(customFieldKeys[0].length).toBeLessThanOrEqual(IMPORT_LIMITS.MAX_KEY_LENGTH);
    expect(customFieldKeys).not.toContain("extra_25");
    expect(rows[0].customFields[customFieldKeys[0]]).toHaveLength(IMPORT_LIMITS.MAX_VALUE_LENGTH);
  });

  it("passes rows without a valid email through with an empty email", async () => {
    const file = await xlsx([
      ["Name", "Email"],
      ["Ada", "not-an-email"],
      ["Grace", ""],
      ["Linus", "linus@x.io"],
    ]);
    const { rows, total } = await parse(file);
    expect(total).toBe(3);
    expect(rows.map((r) => r.email)).toEqual(["", "", "linus@x.io"]);
  });

  it("skips blank rows and does not count them", async () => {
    const file = await xlsx([["Email"], ["a@x.io"], [""], ["b@x.io"]]);
    const { rows, total } = await parse(file);
    expect(total).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it("counts rows past maxRows as skipped without handing them over", async () => {
    const file = await xlsx([["Email"], ["a@x.io"], ["b@x.io"], ["c@x.io"]]);
    const { rows, total, skipped } = await parse(file, { maxRows: 2 });
    expect(total).toBe(3);
    expect(skipped).toBe(1);
    expect(rows.map((r) => r.email)).toEqual(["a@x.io", "b@x.io"]);
  });

  it("finds a header below title rows", async () => {
    const file = await xlsx([
      ["Q3 outreach list"],
      ["Company", "Email"],
      ["Acme", "a@acme.io"],
    ]);
    const { rows, total } = await parse(file);
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ companyName: "Acme", email: "a@acme.io" });
  });

  it("reads a file without a header row as data (a gmail address is no header)", async () => {
    const file = await xlsx([
      ["ann@gmail.com", "Ann"],
      ["bob@gmail.com", "Bob"],
    ]);
    const { rows, total, customFieldKeys } = await parse(file);
    expect(total).toBe(2);
    expect(rows.map((r) => r.email)).toEqual(["ann@gmail.com", "bob@gmail.com"]);
    expect(customFieldKeys).toEqual(["column_2"]);
    expect(rows[1].customFields).toEqual({ column_2: "Bob" });
  });

  it("finds the email column by its values when no header names it, and logs a warning", async () => {
    const loggerModule = await import("../../utils/logger.js");
    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

    const file = await xlsx([
      ["Name", "Correo"],
      ["Ana", "ana@x.es"],
    ]);
    const { rows, customFieldKeys } = await parse(file);

    expect(rows[0].email).toBe("ana@x.es");
    expect(rows[0].firstName).toBe("Ana");
    expect(customFieldKeys).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/no email column/);
    warnSpy.mockRestore();
  });

  it("reads formula cells as their result and drops error cells", async () => {
    const file = await xlsx([
      ["Email", "Score", "Lookup"],
      ["a@x.io", { formula: "1+1", result: 2 }, { error: "#N/A" }],
    ]);
    const { rows } = await parse(file);
    expect(rows[0].customFields).toEqual({ score: "2", lookup: "" });
  });

  it("keeps CSV values as text and replaces control characters", async () => {
    const file = await csv(
      "\uFEFFEmail,Phone,Zip,Note\n" +
      'a@x.io,+15551234567,01234,"line one\nline two"\n' +
      'b@x.io,"=HYPERLINK(""x"")",,\u0000tab\there\n',
    );
    const { rows } = await parse(file);
    expect(rows[0]).toMatchObject({ email: "a@x.io", phone: "+15551234567" });
    expect(rows[0].customFields).toEqual({ zip: "01234", note: "line one line two" });
    // Stored verbatim (exports neutralize formulas); only control characters are removed.
    expect(rows[1].phone).toBe('=HYPERLINK("x")');
    expect(rows[1].customFields.note).toBe("tab here");
  });

  it("drops the apostrophe an export puts before formula-looking values", async () => {
    const file = await csv("email,phone,note\na@x.io,'+1 555 0100,'it's fine\n");
    const { rows } = await parse(file);
    expect(rows[0].phone).toBe("+1 555 0100");
    expect(rows[0].customFields.note).toBe("'it's fine");
  });
});

describe("customFieldKey", () => {
  it("lowercases, replaces other characters with underscores and trims them", () => {
    expect(customFieldKey("Job Title")).toBe("job_title");
    expect(customFieldKey("  #Deal--Size (USD) ")).toBe("deal_size_usd");
    expect(customFieldKey("Café")).toBe("cafe");
    expect(customFieldKey("日本")).toBe("");
    expect(customFieldKey("x".repeat(60))).toHaveLength(IMPORT_LIMITS.MAX_KEY_LENGTH);
  });
});
