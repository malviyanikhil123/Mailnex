import { describe, it, expect, vi } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import ExcelJS from "exceljs";
import { dbEnabled } from "../../test-helpers/db.js";

// ---- Unit tests for import service (mocked repo) ----

describe("ContactsService.importFromFile (unit, mocked repo)", () => {
  it("returns correct summary and calls recordImport with counts", async () => {
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
    const mockRecordImport = vi.fn().mockResolvedValue({ id: 1 });

    const { ContactsService } = await import("./contacts.service.js");
    const { ContactsRepo } = await import("./contacts.repo.js");

    const fakeRepo = {
      bulkInsert: mockBulkInsert,
      recordImport: mockRecordImport,
    } as unknown as InstanceType<typeof ContactsRepo>;

    const service = new ContactsService(fakeRepo);
    const jobId = crypto.randomUUID();
    const userId = 1;

    const summary = await service.importFromFile(userId, tmpFile, "test.xlsx", jobId);

    expect(summary.total).toBe(5);
    expect(summary.invalid).toBe(1);
    expect(summary.duplicate).toBe(1);
    expect(summary.imported).toBe(3);
    expect(summary.skipped).toBe(0);

    expect(mockBulkInsert).toHaveBeenCalledOnce();
    expect(mockRecordImport).toHaveBeenCalledOnce();
    expect(mockRecordImport).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        fileName: "test.xlsx",
        total: 5,
        imported: 3,
        invalid: 1,
        duplicate: 1,
      }),
    );

    const { importProgress } = await import("./contacts.service.js");
    expect(importProgress.get(jobId)?.done).toBe(true);
    expect(importProgress.get(jobId)?.summary?.imported).toBe(3);

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
      recordImport: vi.fn(),
    } as unknown as InstanceType<typeof ContactsRepo>;

    const service = new ContactsService(fakeRepo);
    const jobId = crypto.randomUUID();
    const userId = 1;

    await expect(service.importFromFile(userId, tmpFile, "err.xlsx", jobId)).rejects.toThrow("DB down");
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

    const imports = await contactsRepo.listImports(userId);
    expect(imports).toHaveLength(1);
    expect(imports[0].fileName).toBe("test.xlsx");
    expect(imports[0].importedRows).toBe(8);
  });
});
