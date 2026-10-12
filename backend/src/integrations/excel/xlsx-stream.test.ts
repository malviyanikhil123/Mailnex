import { describe, it, expect, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as zlib from "zlib";
import ExcelJS from "exceljs";
import { parseContactsXlsx, cellText, IMPORT_LIMITS } from "./parser.js";
import {
  xmlGuard,
  type XlsxLimits,
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

// ---------------------------------------------------------------------------
// Workbook-wide limits. Workbooks are crafted by unpacking an ExcelJS file, editing
// its parts and packing them again (stored, no compression).
// ---------------------------------------------------------------------------

async function unpack(file: string): Promise<Map<string, Buffer>> {
  const parts = new Map<string, Buffer>();
  for (const [name, entry] of await readZipDirectory(file)) {
    if (name.endsWith("/")) continue;
    const chunks: Buffer[] = [];
    for await (const c of await openZipEntry(file, entry, 1e8)) chunks.push(c as Buffer);
    parts.set(name, Buffer.concat(chunks));
  }
  return parts;
}

async function pack(parts: Map<string, Buffer>): Promise<string> {
  const file = await tmpFile("xlsx");
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of parts) {
    const n = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    local.push(lh, n, data);
    central.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(parts.size, 8);
  eocd.writeUInt16LE(parts.size, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  await fs.writeFile(file, Buffer.concat([...local, dir, eocd]));
  return file;
}

async function workbook(sheets: unknown[][][]): Promise<string> {
  const file = await tmpFile("xlsx");
  const wb = new ExcelJS.Workbook();
  sheets.forEach((rows, i) => wb.addWorksheet(`S${i + 1}`).addRows(rows));
  await wb.xlsx.writeFile(file);
  return file;
}

async function sheetNames(file: string, limits: XlsxLimits = XLSX_LIMITS): Promise<string[]> {
  const names: string[] = [];
  for await (const sheet of streamXlsxSheets(file, limits)) {
    for await (const _ of sheet.rows) void _;
    names.push(sheet.name);
  }
  return names;
}

const contacts = (n: number) => [["email"], ...Array.from({ length: n }, (_, i) => [`p${i}@x.io`])];

describe("workbook-wide limits", () => {
  it("reads a worksheet part once, however many sheets point at it", async () => {
    const parts = await unpack(await workbook([contacts(3)]));
    const xml = parts.get("xl/workbook.xml")!.toString("utf8");
    const one = /<sheet [^>]*\/>/.exec(xml)![0];
    const many = Array.from({ length: 500 }, (_, i) =>
      one.replace(/name="[^"]*"/, `name="Copy${i}"`).replace(/sheetId="\d+"/, `sheetId="${i + 1}"`),
    ).join("");
    parts.set("xl/workbook.xml", Buffer.from(xml.replace(one, many)));
    expect(await sheetNames(await pack(parts))).toEqual(["Copy0"]);
  });

  it("reads at most MAX_SHEETS worksheets", async () => {
    const file = await workbook([contacts(1), contacts(1), contacts(1)]);
    expect(await sheetNames(file, { ...XLSX_LIMITS, MAX_SHEETS: 2 })).toEqual(["S1", "S2"]);
  });

  it("ends a worksheet once all parts together pass the total budget", async () => {
    // Inflated output comes in ~16 KB chunks, so the sheet spans many of them.
    const file = await workbook([contacts(5000)]);
    const entries = await readZipDirectory(file);
    const meta = ["xl/_rels/workbook.xml.rels", "xl/workbook.xml", "xl/sharedStrings.xml", "xl/styles.xml"]
      .reduce((sum, name) => sum + (entries.get(name)?.uncompressedSize ?? 0), 0);
    const limits = { ...XLSX_LIMITS, MAX_TOTAL_BYTES: meta + 64 * 1024 };
    await expect(sheetNames(file, limits)).rejects.toBeInstanceOf(SheetTooLargeError);

    // The importer keeps the rows it got before the budget ran out.
    const rows: string[] = [];
    const result = await parseContactsXlsx(file, (r) => rows.push(r.email), { xlsxLimits: limits });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(5000);
    expect(result.total).toBe(rows.length);
  });

  it("fails when the parts kept in memory pass the total budget", async () => {
    const file = await workbook([[["email", "note"], ["a@x.io", "x".repeat(20_000)]]]);
    await expect(sheetNames(file, { ...XLSX_LIMITS, MAX_TOTAL_BYTES: 10_000 })).rejects.toBeInstanceOf(XlsxFormatError);
  });

  it("fails on one huge text run in the shared strings or a worksheet", async () => {
    const limits = { ...XLSX_LIMITS, MAX_TEXT_RUN_BYTES: 1000 };
    const shared = await workbook([[["email", "note"], ["a@x.io", "x".repeat(5000)]]]);
    await expect(sheetNames(shared, limits)).rejects.toThrow("A cell is too large");
    const formula = await workbook([[["email", "calc"], ["a@x.io", { formula: `LEN("${"y".repeat(5000)}")`, result: 5000 }]]]);
    await expect(sheetNames(formula, limits)).rejects.toThrow("A cell is too large");
    // The importer gets an error it reports as an unreadable file, not a crash.
    await expect(parseContactsXlsx(formula, () => {}, { xlsxLimits: limits })).rejects.toBeInstanceOf(XlsxFormatError);
  });

  it("fails on a row with too many cells", async () => {
    const wide = await workbook([[["email", ...Array.from({ length: 29 }, (_, i) => `c${i}`)]]]);
    await expect(sheetNames(wide, { ...XLSX_LIMITS, MAX_CELLS_PER_ROW: 20 })).rejects.toThrow("more than 20 cells");
    expect(await sheetNames(wide, { ...XLSX_LIMITS, MAX_CELLS_PER_ROW: 30 })).toEqual(["S1"]);
  });

  it("counts empty styled cells only against the column limit", async () => {
    const file = await tmpFile("xlsx");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S1");
    ws.getCell(1, 1).value = "email";
    for (let c = 2; c <= 31; c++) ws.getCell(1, c).numFmt = "0.00";
    await wb.xlsx.writeFile(file);
    expect(await sheetNames(file, { ...XLSX_LIMITS, MAX_CELLS_PER_ROW: 5 })).toEqual(["S1"]);
    await expect(sheetNames(file, { ...XLSX_LIMITS, MAX_CELL_TAGS_PER_ROW: 10 })).rejects.toBeInstanceOf(XlsxFormatError);
  });
});

describe("xmlGuard", () => {
  const limits = { MAX_TEXT_RUN_BYTES: 10, MAX_ITEM_BYTES: 1000, MAX_CELLS_PER_ROW: 2, MAX_CELL_TAGS_PER_ROW: 3 };
  const feed = async (chunks: string[], use = limits) => {
    const guard = xmlGuard(use);
    const out: Buffer[] = [];
    guard.on("data", (c: Buffer) => out.push(c));
    const done = new Promise<void>((resolve, reject) => {
      guard.on("end", resolve);
      guard.on("error", reject);
    });
    for (const c of chunks) guard.write(Buffer.from(c));
    guard.end();
    await done;
    return Buffer.concat(out).toString();
  };

  it("passes XML through unchanged", async () => {
    const xml = '<row r="1"><c r="A1"><v>1</v></c><c r="B1"/></row>';
    expect(await feed([xml])).toBe(xml);
  });

  it("tracks tags split across chunks and resets the count on each row", async () => {
    await expect(feed(["<row><c><v>1</v></", "c><c><v>2</v></c></row><ro", "w><c><v>3</v></c><x:c>", "</x:c></row>"])).resolves.toBeTruthy();
    await expect(feed(["<row><c>1</c><", "c>2</c><c>3</c></row>"])).rejects.toThrow("more than 2 cells");
  });

  it("fails on a long run of text even when it arrives in pieces", async () => {
    await expect(feed(["<t>12345", "678901</t>"])).rejects.toThrow("A cell is too large");
  });

  it("allows the XML prolog", async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<row><c>1</c></row>';
    await expect(feed([xml], { ...limits, MAX_TEXT_RUN_BYTES: 1000 })).resolves.toBe(xml);
  });

  it("refuses a comment that would hide a fake <row> from the cell count", async () => {
    await expect(feed(["<row><c>1</c><c>2</c><!--<row>--><c>3</c></row>"])).rejects.toThrow(/Comments, CDATA/);
    // Split right after the "<".
    await expect(feed(["<row><c>1</c><", "!--x--></row>"])).rejects.toThrow(/Comments, CDATA/);
  });

  it("refuses CDATA, DOCTYPE and processing instructions after the prolog", async () => {
    await expect(feed(["<row><c><v><![CDATA[<row>]]></v></c></row>"])).rejects.toThrow(/Comments, CDATA/);
    await expect(feed(["<!DOCTYPE x><row/>"])).rejects.toThrow(/Comments, CDATA/);
    await expect(feed(["<row><?pi data?></row>"])).rejects.toThrow(/Comments, CDATA/);
  });

  it("caps a cell with all its inner markup, so short runs can't add up", async () => {
    const small = { ...limits, MAX_TEXT_RUN_BYTES: 100, MAX_ITEM_BYTES: 60 };
    const guard = async (xml: string) => {
      const g = xmlGuard(small);
      g.resume();
      const done = new Promise<void>((resolve, reject) => { g.on("end", resolve); g.on("error", reject); });
      g.end(Buffer.from(xml));
      await done;
    };
    const runs = "<t>abcdefgh</t>".repeat(6); // each run is short; together 90 bytes
    await expect(guard(`<c><is>${runs}</is></c>`)).rejects.toThrow("A cell is too large");
    await expect(guard(`<si>${runs}</si>`)).rejects.toThrow("A cell is too large");
    // Markup outside cells (e.g. merge cells after the sheet data) is not an item.
    await expect(guard(`<c><v>1</v></c><mergeCells>${'<mergeCell ref="A1:B2"/>'.repeat(10)}</mergeCells>`)).resolves.toBeUndefined();
  });
});

describe("longest Excel cells", () => {
  it("reads 32,767-character cells however they are encoded", async () => {
    const values = {
      emoji: "\u{1F600}".repeat(16_383) + "a", // 4 UTF-8 bytes per emoji
      amp: "&".repeat(32_767), // "&amp;"
      apos: "'".repeat(32_767), // "&apos;", ExcelJS's longest escape
    };
    for (const v of Object.values(values)) expect(v).toHaveLength(32_767);
    const file = await workbook([[["email", "emoji", "amp", "apos"], ["a@x.io", values.emoji, values.amp, values.apos]]]);
    const rows: { email: string; customFields: Record<string, string> }[] = [];
    await parseContactsXlsx(file, (r) => rows.push(r));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("a@x.io");
    expect(rows[0].customFields.amp).toBe("&".repeat(IMPORT_LIMITS.MAX_VALUE_LENGTH));
    expect(rows[0].customFields.emoji.startsWith("\u{1F600}")).toBe(true);
  });
});

describe("cellText", () => {
  it("cuts a cell at MAX_CELL_CHARS", () => {
    expect(cellText("a".repeat(IMPORT_LIMITS.MAX_CELL_CHARS + 10))).toHaveLength(IMPORT_LIMITS.MAX_CELL_CHARS);
    expect(cellText("  short  ")).toBe("short");
  });
});
