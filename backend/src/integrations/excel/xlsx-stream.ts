/**
 * Streams the rows of an .xlsx without inflating the workbook into memory.
 *
 * ExcelJS's own WorkbookReader reads the zip front to back and spools any worksheet
 * that comes before the shared strings to a temp file; on files laid out like that
 * (ExcelJS's own writer, Google Sheets exports) it loses entries and fails at random.
 * So the zip's central directory is read here instead, and the parts are handed to
 * ExcelJS's reader in the order it needs: relationships, workbook, shared strings,
 * styles, then each worksheet in workbook order. Cells are still parsed by ExcelJS, so
 * values come out as with Workbook.xlsx.readFile (dates, formulas, rich text, errors),
 * except that hyperlink targets are not resolved: such a cell reads as its text.
 *
 * Every part is inflated through a byte cap, which also catches a zip whose directory
 * lies about its sizes. Parts that ExcelJS keeps whole in memory (shared strings,
 * styles, workbook) get small caps; a worksheet is read row by row, and running past
 * its cap only ends that sheet (SheetTooLargeError).
 *
 * This uses WorkbookReader's underscore methods (exceljs 4.4). If an upgrade renames
 * them, the parser tests fail rather than imports silently going wrong.
 */
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { pipeline, Readable, Transform } from "node:stream";
import ExcelJS from "exceljs";

export const XLSX_LIMITS = {
  /** workbook.xml and the relationship parts. */
  MAX_META_BYTES: 4 * 1024 * 1024,
  /** Kept whole in memory by ExcelJS. */
  MAX_SHARED_STRINGS_BYTES: 100 * 1024 * 1024,
  MAX_STYLES_BYTES: 16 * 1024 * 1024,
  /** Read row by row; reading stops past this. */
  MAX_SHEET_BYTES: 512 * 1024 * 1024,
} as const;

export class XlsxFormatError extends Error {}

/** A worksheet part inflated past its cap; the rows read so far are still good. */
export class SheetTooLargeError extends Error {}

type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

async function readAt(handle: fs.promises.FileHandle, length: number, position: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, position);
  if (bytesRead !== length) throw new XlsxFormatError("Truncated zip file");
  return buf;
}

/** The central directory: every entry by name. */
export async function readZipDirectory(filePath: string): Promise<Map<string, ZipEntry>> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    // The end-of-central-directory record is 22 bytes plus a comment of up to 64 KB.
    const tailLength = Math.min(size, 22 + 0xffff);
    if (tailLength < 22) throw new XlsxFormatError("Not a zip file");
    const tail = await readAt(handle, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new XlsxFormatError("Not a zip file");

    const count = tail.readUInt16LE(eocd + 10);
    const dirSize = tail.readUInt32LE(eocd + 12);
    const dirOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || dirOffset === ZIP64_MARKER) throw new XlsxFormatError("ZIP64 workbooks are not supported");
    if (dirOffset + dirSize > size) throw new XlsxFormatError("Corrupt zip directory");

    const dir = await readAt(handle, dirSize, dirOffset);
    const entries = new Map<string, ZipEntry>();
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
        throw new XlsxFormatError("Corrupt zip directory");
      }
      const nameLength = dir.readUInt16LE(p + 28);
      const extraLength = dir.readUInt16LE(p + 30);
      const commentLength = dir.readUInt16LE(p + 32);
      const entry: ZipEntry = {
        flags: dir.readUInt16LE(p + 8),
        method: dir.readUInt16LE(p + 10),
        compressedSize: dir.readUInt32LE(p + 20),
        uncompressedSize: dir.readUInt32LE(p + 24),
        localHeaderOffset: dir.readUInt32LE(p + 42),
        name: dir.toString("utf8", p + 46, p + 46 + nameLength),
      };
      entries.set(entry.name, entry);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** Passes at most `max` bytes, then fails with the error `tooBig()` builds. */
function byteCap(max: number, tooBig: () => Error): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (seen > max) callback(tooBig());
      else callback(null, chunk);
    },
  });
}

/** The inflated bytes of one entry, capped at `max`. */
export async function openZipEntry(
  filePath: string,
  entry: ZipEntry,
  max: number,
  tooBig: () => Error = () => new XlsxFormatError(`${entry.name} is too large`),
): Promise<Readable> {
  if (entry.flags & 0x1) throw new XlsxFormatError("Encrypted workbooks are not supported");
  if (entry.compressedSize === ZIP64_MARKER || entry.uncompressedSize === ZIP64_MARKER) {
    throw new XlsxFormatError("ZIP64 workbooks are not supported");
  }
  // The declared size can lie; the cap below holds either way.
  if (entry.uncompressedSize > max) throw tooBig();

  const handle = await fs.promises.open(filePath, "r");
  let header: Buffer;
  try {
    header = await readAt(handle, 30, entry.localHeaderOffset);
  } finally {
    await handle.close();
  }
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new XlsxFormatError("Corrupt zip entry");
  const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);

  const raw: Readable = entry.compressedSize === 0
    ? Readable.from([])
    : fs.createReadStream(filePath, { start, end: start + entry.compressedSize - 1 });
  const cap = byteCap(max, tooBig);
  const done = () => {};
  if (entry.method === 0) return pipeline(raw, cap, done);
  if (entry.method === 8) return pipeline(raw, zlib.createInflateRaw(), cap, done);
  raw.destroy();
  throw new XlsxFormatError(`Unsupported zip compression method ${entry.method}`);
}

/** The parts of ExcelJS's WorkbookReader this module drives (exceljs 4.4). */
interface ReaderInternals {
  workbookRels?: { Id: string; Target: string; Type?: string }[];
  model?: { sheets?: { rId: string; name?: string }[] };
  _parseRels(entry: Readable): Promise<void>;
  _parseWorkbook(entry: Readable): Promise<void>;
  _parseSharedStrings(entry: Readable): AsyncIterable<unknown>;
  _parseStyles(entry: Readable): Promise<void>;
  _parseWorksheet(iterator: Readable, sheetNo: string): Iterable<{ eventType: string; value: AsyncIterable<XlsxRow> }>;
}

export type XlsxRow = { number: number; values: unknown };

export type XlsxSheet = {
  name: string;
  /** Rows in file order; throws SheetTooLargeError when the part passes its cap. */
  rows: AsyncIterable<XlsxRow>;
  /** Stops inflating the rest of this sheet. */
  close(): void;
};

/** "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml". */
function partPath(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/**
 * Every worksheet of the workbook, in workbook order. Consume (or close) each sheet
 * before asking for the next one.
 */
export async function* streamXlsxSheets(
  filePath: string,
  limits: Record<keyof typeof XLSX_LIMITS, number> = XLSX_LIMITS,
): AsyncGenerator<XlsxSheet> {
  const entries = await readZipDirectory(filePath);
  const part = async (name: string, max: number) => {
    const entry = entries.get(name);
    return entry ? openZipEntry(filePath, entry, max) : null;
  };

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    // Needed to tell date cells from numbers, as Workbook.xlsx.readFile does.
    styles: "cache",
    hyperlinks: "ignore",
    entries: "ignore",
  }) as unknown as ReaderInternals;

  const rels = await part("xl/_rels/workbook.xml.rels", limits.MAX_META_BYTES);
  const workbook = await part("xl/workbook.xml", limits.MAX_META_BYTES);
  if (!rels || !workbook) throw new XlsxFormatError("Not an xlsx workbook");
  await reader._parseRels(rels);
  await reader._parseWorkbook(workbook);

  const sharedStrings = await part("xl/sharedStrings.xml", limits.MAX_SHARED_STRINGS_BYTES);
  // Cells refer to shared strings by index, so an empty table is still needed.
  if (sharedStrings) for await (const _ of reader._parseSharedStrings(sharedStrings)) void _;
  else for await (const _ of reader._parseSharedStrings(Readable.from([]))) void _;
  const styles = await part("xl/styles.xml", limits.MAX_STYLES_BYTES);
  if (styles) await reader._parseStyles(styles);

  const relById = new Map((reader.workbookRels ?? []).map((r) => [r.Id, r]));
  for (const sheet of reader.model?.sheets ?? []) {
    const rel = relById.get(sheet.rId);
    // Chartsheets and dialog sheets have no rows.
    if (!rel || (rel.Type && !rel.Type.endsWith("/worksheet"))) continue;
    const path = partPath(rel.Target);
    const entry = entries.get(path);
    if (!entry) continue;

    const stream = await openZipEntry(
      filePath,
      entry,
      limits.MAX_SHEET_BYTES,
      () => new SheetTooLargeError(`${path} is too large`),
    );
    const sheetNo = /sheet(\d+)\.xml$/.exec(path)?.[1] ?? "1";
    const emitted = [...reader._parseWorksheet(stream, sheetNo)].find((e) => e.eventType === "worksheet");
    if (!emitted) {
      stream.destroy();
      continue;
    }
    try {
      yield { name: sheet.name ?? "", rows: emitted.value, close: () => stream.destroy() };
    } finally {
      stream.destroy();
    }
  }
}
