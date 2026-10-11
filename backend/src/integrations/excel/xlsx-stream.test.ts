import { describe, it, expect, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import ExcelJS from "exceljs";
import {
  openZipEntry,
  readZipDirectory,
  streamXlsxSheets,
  SheetTooLargeError,
  XLSX_LIMITS,
  XlsxFormatError,
} from "./xlsx-stream.js";

const tmpFiles: string[] = [];

async function tmpFile(ext: string): Promise<string> {
  const file = path.join(os.tmpdir(), `${crypto.randomUUID()}.${ext}`);
  tmpFiles.push(file);
  return file;
}

async function xlsx(rows: unknown[][]): Promise<string> {
  const file = await tmpFile("xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const row of rows) ws.addRow(row);
  await wb.xlsx.writeFile(file);
  return file;
}

async function drain(stream: AsyncIterable<unknown>): Promise<number> {
  let n = 0;
  for await (const chunk of stream) n += (chunk as Buffer).length;
  return n;
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((f) => fs.unlink(f).catch(() => {})));
});

describe("readZipDirectory", () => {
  it("lists the parts of a workbook", async () => {
    const entries = await readZipDirectory(await xlsx([["email"], ["a@x.io"]]));
    expect(entries.has("xl/workbook.xml")).toBe(true);
    expect(entries.has("xl/worksheets/sheet1.xml")).toBe(true);
  });

  it("rejects a file that is not a zip", async () => {
    const file = await tmpFile("xlsx");
    await fs.writeFile(file, "this is not a zip file");
    await expect(readZipDirectory(file)).rejects.toBeInstanceOf(XlsxFormatError);
  });
});

describe("openZipEntry", () => {
  it("rejects a part whose declared size is over the cap before inflating it", async () => {
    const file = await xlsx([["email"], ["a@x.io"]]);
    const entry = (await readZipDirectory(file)).get("xl/worksheets/sheet1.xml")!;
    await expect(openZipEntry(file, entry, 10)).rejects.toThrow(/too large/);
  });

  it("stops inflating at the cap even when the zip lies about the size (zip bomb)", async () => {
    const file = await xlsx([["email", "note"], ["a@x.io", "x".repeat(50_000)]]);
    const entry = (await readZipDirectory(file)).get("xl/sharedStrings.xml")!;
    expect(entry.uncompressedSize).toBeGreaterThan(50_000);
    // Pretend the directory claims the part is tiny.
    const stream = await openZipEntry(file, { ...entry, uncompressedSize: 100 }, 1000);
    await expect(drain(stream)).rejects.toThrow(/too large/);
  });

  it("inflates a part in full when it is under the cap", async () => {
    const file = await xlsx([["email"], ["a@x.io"]]);
    const entry = (await readZipDirectory(file)).get("xl/workbook.xml")!;
    expect(await drain(await openZipEntry(file, entry, 1_000_000))).toBe(entry.uncompressedSize);
  });
});

describe("streamXlsxSheets", () => {
  it("yields every worksheet in workbook order with its rows", async () => {
    const file = await tmpFile("xlsx");
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("First").addRows([["email"], ["a@x.io"]]);
    wb.addWorksheet("Second").addRows([["email"], ["b@x.io"], ["c@x.io"]]);
    await wb.xlsx.writeFile(file);

    const seen: { name: string; rows: number }[] = [];
    for await (const sheet of streamXlsxSheets(file)) {
      let rows = 0;
      for await (const _ of sheet.rows) rows++;
      seen.push({ name: sheet.name, rows });
    }
    expect(seen).toEqual([{ name: "First", rows: 2 }, { name: "Second", rows: 3 }]);
  });

  it("ends a worksheet with SheetTooLargeError past its cap", async () => {
    const file = await xlsx(Array.from({ length: 500 }, (_, i) => [`row${i}@x.io`, i]));
    const limits = { ...XLSX_LIMITS, MAX_SHEET_BYTES: 2000 };
    const read = async () => {
      for await (const sheet of streamXlsxSheets(file, limits)) for await (const _ of sheet.rows) void _;
    };
    await expect(read()).rejects.toBeInstanceOf(SheetTooLargeError);
  });

  it("refuses shared strings over their cap, since they are kept in memory", async () => {
    const file = await xlsx([["email", "note"], ["a@x.io", "x".repeat(5000)]]);
    const limits = { ...XLSX_LIMITS, MAX_SHARED_STRINGS_BYTES: 1000 };
    const read = async () => {
      for await (const sheet of streamXlsxSheets(file, limits)) sheet.close();
    };
    await expect(read()).rejects.toThrow(/too large/);
  });
});
