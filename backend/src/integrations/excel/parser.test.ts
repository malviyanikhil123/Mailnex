import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import ExcelJS from "exceljs";
import { parseContactsXlsx } from "./parser.js";

describe("parseContactsXlsx", () => {
  it("reads 3 rows from a fixture xlsx", async () => {
    // Create fixture file
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["companyName", "location", "email"]); // header
    ws.addRow(["Acme Inc", "New York", "alice@acme.com"]);
    ws.addRow(["Globex", "LA", "bob@globex.com"]);
    ws.addRow(["Initech", "Austin", "charlie@initech.com"]);
    await wb.xlsx.writeFile(tmpFile);

    const rows: Array<{ companyName: string; location: string; email: string }> = [];
    const total = await parseContactsXlsx(tmpFile, (row) => {
      rows.push(row);
    });

    expect(total).toBe(3);
    expect(rows).toHaveLength(3);
    expect(rows[0].email).toBe("alice@acme.com");
    expect(rows[0].companyName).toBe("Acme Inc");
    expect(rows[1].email).toBe("bob@globex.com");
    expect(rows[2].email).toBe("charlie@initech.com");

    await fs.unlink(tmpFile);
  });

  it("lowercases email values", async () => {
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["companyName", "location", "email"]);
    ws.addRow(["Test Co", "London", "Test@EXAMPLE.COM"]);
    await wb.xlsx.writeFile(tmpFile);

    const rows: Array<{ companyName: string; location: string; email: string }> = [];
    await parseContactsXlsx(tmpFile, (row) => rows.push(row));

    expect(rows[0].email).toBe("test@example.com");

    await fs.unlink(tmpFile);
  });

  it("logs a warning when expected header columns are missing", async () => {
    // Only provide 'email' — 'companyName' and 'location' are absent
    const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.xlsx`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["email"]); // missing companyName and location
    ws.addRow(["only@email.com"]);
    await wb.xlsx.writeFile(tmpFile);

    // Spy on the logger module after it has been imported by parser
    const loggerModule = await import("../../utils/logger.js");
    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

    const rows: Array<{ companyName: string; location: string; email: string }> = [];
    await parseContactsXlsx(tmpFile, (row) => rows.push(row));

    // Should have warned about the two missing columns
    expect(warnSpy).toHaveBeenCalledOnce();
    const [obj, msg] = warnSpy.mock.calls[0] as [{ missingColumns: string[] }, string];
    expect(obj.missingColumns).toContain("companyName");
    expect(obj.missingColumns).toContain("location");
    expect(msg).toMatch(/missing expected column/);

    warnSpy.mockRestore();
    await fs.unlink(tmpFile);
  });
});
