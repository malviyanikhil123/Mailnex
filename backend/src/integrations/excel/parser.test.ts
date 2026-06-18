import { describe, it, expect } from "vitest";
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
});
