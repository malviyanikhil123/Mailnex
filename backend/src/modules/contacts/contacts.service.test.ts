import { describe, it, expect, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import ExcelJS from "exceljs";
import { dbEnabled } from "../../test-helpers/db.js";

// ---- Unit tests for import service (mocked repo) ----

describe("ContactsService.importFromFile (unit, mocked repo)", () => {
  it("returns correct summary, links contacts to the import and stores its counts", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["companyName", "location", "email"]);
    ws.addRow(["Acme Inc", "New York", "alice@acme.com"]);
    ws.addRow(["Globex", "LA", "bob@globex.com"]);
    ws.addRow(["Initech", "Austin", "charlie@initech.com"]);
    ws.addRow(["BadCo", "Nowhere", "not-an-email"]);
    ws.addRow(["Acme Inc", "New York", "alice@acme.com"]);
    await wb.xlsx.writeFile(tmpFile);

    const mockBulkInsert = vi.fn().mockResolvedValue({ inserted: 3 });
    const mockRecordImport = vi.fn().mockResolvedValue({ id: 42 });
    const mockUpdateCounts = vi.fn().mockResolvedValue(undefined);

    const { ContactsService } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");

    const fakeRepo = {
      bulkInsert: mockBulkInsert,
      recordImport: mockRecordImport,
      updateImportCounts: mockUpdateCounts,
    } as unknown as InstanceType<typeof ContactsRepo>;

    const service = new ContactsService(fakeRepo);
    const jobId = crypto.randomUUID();
    const userId = 1;

    const summary = await service.importFromFile(userId, tmpFile, "test.xlsx", jobId, "Follow-ups");

    expect(summary.total).toBe(5);
    expect(summary.invalid).toBe(1);
    expect(summary.duplicate).toBe(1);
    expect(summary.imported).toBe(3);
    expect(summary.skipped).toBe(0);

    expect(mockRecordImport).toHaveBeenCalledOnce();
    expect(mockRecordImport).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ name: "Follow-ups", fileName: "test.xlsx", total: 5 }),
    );
    expect(mockBulkInsert).toHaveBeenCalledOnce();
    expect(mockBulkInsert).toHaveBeenCalledWith(userId, expect.any(Array), 42);
    expect(mockBulkInsert.mock.calls[0][1]).toHaveLength(3);
    expect(mockUpdateCounts).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ total: 5, imported: 3, invalid: 1, duplicate: 1 }),
    );

    const { importProgress } = await import("./contacts.service.js");
    expect(importProgress.get(jobId)?.done).toBe(true);
    expect(importProgress.get(jobId)?.summary?.imported).toBe(3);

    const { getImportProgress } = await import("./contacts.service.js");
    expect(getImportProgress(userId, jobId)?.done).toBe(true);
    // Another user polling the same job id sees nothing.
    expect(getImportProgress(userId + 1, jobId)).toBeNull();

    await expect(fs.access(tmpFile)).rejects.toThrow();
  }, 15_000);

  it("deletes the temp file even when import fails", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["companyName", "location", "email"]);
    ws.addRow(["Acme", "NY", "err@acme.com"]);
    await wb.xlsx.writeFile(tmpFile);

    const { ContactsService } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");

    const fakeRepo = {
      bulkInsert: vi.fn().mockRejectedValue(new Error("DB down")),
      recordImport: vi.fn().mockResolvedValue({ id: 7 }),
      deleteImport: vi.fn().mockResolvedValue(undefined),
    } as unknown as InstanceType<typeof ContactsRepo>;

    const service = new ContactsService(fakeRepo);
    const jobId = crypto.randomUUID();
    const userId = 1;

    await expect(service.importFromFile(userId, tmpFile, "err.xlsx", jobId)).rejects.toThrow("DB down");
    await expect(fs.access(tmpFile)).rejects.toThrow();

    const { importProgress } = await import("./contacts.service.js");
    expect(importProgress.get(jobId)).toMatchObject({ done: true, error: "Import failed. Please try again." });
  });

  it("imports generic contacts: names, phone, website and custom fields; only email is required", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Name", "Email", "Phone", "Website", "Industry"]);
    ws.addRow(["Ada Lovelace", "ada@engines.io", "+44 1234", "engines.io", "Computing"]);
    ws.addRow(["", "solo@x.io", "", "", ""]);
    ws.addRow(["No Email", "", "", "", "Retail"]);
    await wb.xlsx.writeFile(tmpFile);

    const { ContactsService } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");

    const bulkInsert = vi.fn().mockResolvedValue({ inserted: 2 });
    const recordImport = vi.fn().mockResolvedValue({ id: 5 });
    const fakeRepo = {
      bulkInsert,
      recordImport,
      updateImportCounts: vi.fn().mockResolvedValue(undefined),
    } as unknown as InstanceType<typeof ContactsRepo>;

    const summary = await new ContactsService(fakeRepo).importFromFile(1, tmpFile, "people.xlsx", crypto.randomUUID());

    expect(summary).toEqual({ total: 3, imported: 2, skipped: 0, duplicate: 0, invalid: 1 });
    expect(recordImport).toHaveBeenCalledWith(1, expect.objectContaining({ customFieldKeys: ["industry"] }));
    const rows = bulkInsert.mock.calls[0][1];
    expect(rows).toEqual([
      {
        email: "ada@engines.io",
        firstName: "Ada",
        lastName: "Lovelace",
        companyName: null,
        phone: "+44 1234",
        website: "engines.io",
        location: null,
        customFields: { industry: "Computing" },
      },
      {
        email: "solo@x.io",
        firstName: null,
        lastName: null,
        companyName: null,
        phone: null,
        website: null,
        location: null,
        customFields: { industry: "" },
      },
    ]);
  });

  it("fails the import with a clear message when the file has no email column", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.csv`);
    await fs.writeFile(tmpFile, "Name,Company\nAda,Acme\n", "utf8");

    const { ContactsService, importProgress, NO_EMAIL_COLUMN_MESSAGE } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");
    const recordImport = vi.fn();
    const fakeRepo = { recordImport } as unknown as InstanceType<typeof ContactsRepo>;

    const jobId = crypto.randomUUID();
    await expect(new ContactsService(fakeRepo).importFromFile(1, tmpFile, "people.csv", jobId)).rejects.toThrow(
      NO_EMAIL_COLUMN_MESSAGE,
    );
    expect(NO_EMAIL_COLUMN_MESSAGE).toBe("No email column found. Add a column named email.");
    expect(importProgress.get(jobId)).toMatchObject({ done: true, error: NO_EMAIL_COLUMN_MESSAGE });
    expect(recordImport).not.toHaveBeenCalled();
    await expect(fs.access(tmpFile)).rejects.toThrow();
  });

  it("finishes the job with a readable error when the file is not a spreadsheet", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    await fs.writeFile(tmpFile, "this is not a zip file");

    const { ContactsService, importProgress } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");
    const recordImport = vi.fn();
    const fakeRepo = { recordImport } as unknown as InstanceType<typeof ContactsRepo>;

    const jobId = crypto.randomUUID();
    await expect(new ContactsService(fakeRepo).importFromFile(1, tmpFile, "bad.xlsx", jobId)).rejects.toThrow(
      /Could not read the file/,
    );
    expect(importProgress.get(jobId)).toMatchObject({ done: true, error: expect.stringMatching(/\.xlsx or \.csv/) });
    expect(recordImport).not.toHaveBeenCalled();
    await expect(fs.access(tmpFile)).rejects.toThrow();
  });
});

// ---- DB integration tests (gated) ----

describe.skipIf(!dbEnabled)("ContactsRepo integration (DB gated)", () => {
  const userId = 1;

  it("bulkInsert inserts contacts and ignores email conflicts", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contacts } = await import("../../db/schema/contacts.js");

    await db.delete(contacts);

    const result = await contactsRepo.bulkInsert(userId, [
      { companyName: "TestCo", location: "NY", email: "test@testco.com" },
    ]);
    expect(result.inserted).toBe(1);

    const result2 = await contactsRepo.bulkInsert(userId, [
      { companyName: "TestCo", location: "NY", email: "test@testco.com" },
    ]);
    expect(result2.inserted).toBe(0);
  });

  it("list returns paginated results with ilike search", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contacts } = await import("../../db/schema/contacts.js");

    await db.delete(contacts);
    await contactsRepo.bulkInsert(userId, [
      { companyName: "Alpha Corp", location: "NY", email: "alpha@alpha.com" },
      { companyName: "Beta Inc", location: "LA", email: "beta@beta.com" },
    ]);

    const result = await contactsRepo.list(userId, { search: "alpha", page: 1, limit: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe("alpha@alpha.com");
    expect(result.total).toBe(1);
  });

  it("list search matches first name, last name and the full name", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contacts } = await import("../../db/schema/contacts.js");

    await db.delete(contacts);
    await contactsRepo.bulkInsert(userId, [
      { email: "ada@x.io", firstName: "Ada", lastName: "Lovelace", customFields: { industry: "Computing" } },
      { email: "grace@x.io", firstName: "Grace", lastName: "Hopper" },
    ]);

    for (const search of ["ada", "lovelace", "Ada Lovelace"]) {
      const result = await contactsRepo.list(userId, { search, page: 1, limit: 10 });
      expect(result.rows.map((r) => r.email)).toEqual(["ada@x.io"]);
    }
    const [ada] = (await contactsRepo.list(userId, { search: "ada", page: 1, limit: 10 })).rows;
    expect(ada.companyName).toBeNull();
    expect(ada.customFields).toEqual({ industry: "Computing" });
  });

  it("getById returns contact or null", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contacts } = await import("../../db/schema/contacts.js");

    await db.delete(contacts);
    const [inserted] = await db
      .insert(contacts)
      .values({ userId, companyName: "Test", location: "TX", email: "test@test.com" })
      .returning();

    const found = await contactsRepo.getById(userId, inserted.id);
    expect(found).not.toBeNull();
    expect(found?.email).toBe("test@test.com");

    const notFound = await contactsRepo.getById(userId, 999999);
    expect(notFound).toBeNull();
  });

  it("delete removes contact", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contacts } = await import("../../db/schema/contacts.js");

    await db.delete(contacts);
    const [inserted] = await db
      .insert(contacts)
      .values({ userId, companyName: "DelTest", location: "NY", email: "del@test.com" })
      .returning();

    const deleted = await contactsRepo.delete(userId, inserted.id);
    expect(deleted).not.toBeNull();

    const notFound = await contactsRepo.getById(userId, inserted.id);
    expect(notFound).toBeNull();
  });

  it("recordImport and listImports work", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contactsImports } = await import("../../db/schema/imports.js");

    await db.delete(contactsImports);

    await contactsRepo.recordImport(userId, {
      fileName: "test.xlsx",
      total: 10,
      imported: 8,
      skipped: 0,
      duplicate: 1,
      invalid: 1,
    });

    const { imports, total } = await contactsRepo.listImports(userId);
    expect(total).toBe(1);
    expect(imports).toHaveLength(1);
    expect(imports[0].fileName).toBe("test.xlsx");
    expect(imports[0].importedRows).toBe(8);
  });

  it("listImports filters by name or file name, sorts and paginates", async () => {
    const { contactsRepo } = await import("./contacts.repo.js");
    const { db } = await import("../../db/index.js");
    const { contactsImports } = await import("../../db/schema/imports.js");

    await db.delete(contactsImports);
    const counts = { total: 1, imported: 1, skipped: 0, duplicate: 0, invalid: 0 };
    await contactsRepo.recordImport(userId, { ...counts, name: "Bakeries", fileName: "a.xlsx" });
    await contactsRepo.recordImport(userId, { ...counts, name: null, fileName: "bakery-leads.csv" });
    await contactsRepo.recordImport(userId, { ...counts, name: "Gyms", fileName: "c.xlsx" });

    const found = await contactsRepo.listImports(userId, { search: "bake", sort: "oldest" });
    expect(found.imports.map((i) => i.fileName)).toEqual(["a.xlsx", "bakery-leads.csv"]);

    const page = await contactsRepo.listImports(userId, { sort: "newest", page: 1, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.imports.map((i) => i.fileName)).toEqual(["c.xlsx", "bakery-leads.csv"]);
  });
});
