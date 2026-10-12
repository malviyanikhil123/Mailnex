/**
 * Streams the rows of an .xlsx without inflating the workbook into memory.
 *
 * ExcelJS's own WorkbookReader reads the zip front to back and spools any worksheet
 * that comes before the shared strings to a temp file; on files laid out like that
 * (ExcelJS's own writer, Google Sheets exports) it loses entries and fails at random.
 * So the zip's central directory is read here instead, and the parts are handed to
 * ExcelJS's reader in the order it needs: relationships, workbook, shared strings,
 * styles, then the worksheets in workbook order. Cells are still parsed by ExcelJS, so
 * values come out as with Workbook.xlsx.readFile (dates, formulas, rich text, errors),
 * except that hyperlink targets are not resolved: such a cell reads as its text.
 *
 * Limits (XLSX_LIMITS), all enforced on the inflated bytes, so a zip whose directory
 * lies about sizes is caught too:
 *  - each part has its own cap, and all parts of one workbook share a total budget;
 *  - parts ExcelJS keeps whole in memory (shared strings, styles, workbook) get small
 *    caps and fail the read when exceeded;
 *  - a worksheet is read row by row; passing its cap or the total budget only ends
 *    the read there (SheetTooLargeError), the rows so far are kept;
 *  - at most MAX_SHEETS distinct worksheet parts are read, each part once, however
 *    many sheets workbook.xml lists;
 *  - before the XML parser, a byte-level guard (xmlGuard) fails the read on
 *    comments, CDATA and processing instructions, on a text or tag run longer than
 *    MAX_TEXT_RUN_BYTES (the parser would buffer it whole), on a cell or shared
 *    string over MAX_ITEM_BYTES, and on a row with more than MAX_CELLS_PER_ROW cells
 *    holding content (or MAX_CELL_TAGS_PER_ROW cells of any kind, Excel's limit).
 *
 * The parse runs on the main thread: with these caps its memory is bounded, so a
 * worker thread is not used.
 *
 * This uses WorkbookReader's underscore methods (exceljs 4.4). If an upgrade renames
 * them, the parser tests fail rather than imports silently going wrong.
 */
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { pipeline, Readable, Transform } from "node:stream";
import ExcelJS from "exceljs";

const MB = 1024 * 1024;

export const XLSX_LIMITS = {
  /** workbook.xml and the relationship parts. */
  MAX_META_BYTES: 4 * MB,
  /** Kept whole in memory by ExcelJS. */
  MAX_SHARED_STRINGS_BYTES: 32 * MB,
  MAX_STYLES_BYTES: 8 * MB,
  /** One worksheet part; reading stops past this. */
  MAX_SHEET_BYTES: 64 * MB,
  /** Every part of the workbook together. */
  MAX_TOTAL_BYTES: 256 * MB,
  /** Distinct worksheet parts read. */
  MAX_SHEETS: 10,
  /**
   * One run of text or one tag: Excel's longest cell (32,767 characters) at the worst
   * encoding, 7 bytes a character (Excel's "_x000D_" escapes; ExcelJS's "&quot;" is 6).
   */
  MAX_TEXT_RUN_BYTES: 32_767 * 7,
  /** One cell or shared string with all its markup (rich-text runs, formula, value). */
  MAX_ITEM_BYTES: 2 * MB,
  /** Cells with content in one row. */
  MAX_CELLS_PER_ROW: 1000,
  /** Cells of any kind (empty styled ones too) in one row: Excel's column limit. */
  MAX_CELL_TAGS_PER_ROW: 16_384,
} as const;

export type XlsxLimits = Record<keyof typeof XLSX_LIMITS, number>;

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

/** Inflated bytes left for the rest of one workbook. */
export type ByteBudget = { remaining: number };

/**
 * Passes at most `max` bytes (and no more than the shared budget has left), then
 * fails with the error `tooBig()` builds.
 */
function byteCap(max: number, tooBig: () => Error, budget?: ByteBudget): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (budget) budget.remaining -= chunk.length;
      if (seen > max || (budget && budget.remaining < 0)) callback(tooBig());
      else callback(null, chunk);
    },
  });
}

const LT = 0x3c; // <
const GT = 0x3e; // >
const SLASH = 0x2f; // /

function isNameByte(b: number): boolean {
  // Letters, digits and the punctuation XML names use (":" for prefixes like "x:c").
  return (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a) || (b >= 0x30 && b <= 0x39) ||
    b === 0x3a || b === 0x5f || b === 0x2d || b === 0x2e || b === SLASH;
}

const BANG = 0x21; // !
const QUESTION = 0x3f; // ?

/** Elements whose whole content, inner markup included, is one item: a cell, a shared string. */
const ITEM_TAGS = new Set(["c", "si"]);

/**
 * A byte-level look at worksheet / shared-strings XML before the parser sees it: the
 * parser keeps a whole text node or tag in memory, and ExcelJS keeps every cell of a
 * row, so both are bounded here. "<" and ">" are ASCII, so UTF-8 needs no decoding,
 * and in well-formed XML "<" only ever starts markup (attribute values can't hold it).
 *
 *  - Comments, CDATA, DOCTYPE and processing instructions ("<!", and "<?" after the
 *    prolog) fail the read: Excel never writes them in these parts, and they could
 *    hide a fake "<row>" from this count or split a huge text into short runs.
 *  - A text or tag run is capped (MAX_TEXT_RUN_BYTES), and so is one item, i.e. a
 *    cell or shared string with all its inner markup (MAX_ITEM_BYTES).
 *  - Cells per row are capped (MAX_CELLS_PER_ROW with content, MAX_CELL_TAGS_PER_ROW
 *    in all).
 */
export function xmlGuard(
  limits: Pick<XlsxLimits, "MAX_TEXT_RUN_BYTES" | "MAX_ITEM_BYTES" | "MAX_CELLS_PER_ROW" | "MAX_CELL_TAGS_PER_ROW">,
): Transform {
  let inTag = false;
  let afterLt = false;
  let rootSeen = false;
  let run = 0;
  let item = 0;
  let inItem = false;
  let naming = false;
  let name = "";
  let prev = 0;
  let cells = 0;
  let filled = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const fail = (message: string) => callback(new XlsxFormatError(message));
      for (let i = 0; i < chunk.length; i++) {
        const b = chunk[i];
        if (inItem && ++item > limits.MAX_ITEM_BYTES) return fail("A cell is too large");
        if (afterLt) {
          afterLt = false;
          if (b === BANG || (b === QUESTION && rootSeen)) {
            return fail("Comments, CDATA and processing instructions are not allowed in a worksheet");
          }
          if (b !== QUESTION && b !== SLASH) rootSeen = true;
        }
        if (b === LT) {
          inTag = true;
          afterLt = true;
          naming = true;
          name = "";
          run = 0;
        } else if (b === GT && inTag) {
          inTag = false;
          naming = false;
          run = 0;
          const closing = name.startsWith("/");
          const tag = name.slice(name.lastIndexOf(":") + 1).replace(/^\//, "");
          if (ITEM_TAGS.has(tag)) {
            inItem = !closing && prev !== SLASH;
            item = 0;
          }
          // Closing tags ("</c>", "</x:c>") are not counted.
          const local = closing ? "" : tag;
          if (local === "row") {
            cells = 0;
            filled = 0;
          } else if (local === "c") {
            cells++;
            if (prev !== SLASH) filled++;
            if (filled > limits.MAX_CELLS_PER_ROW || cells > limits.MAX_CELL_TAGS_PER_ROW) {
              return fail(`A row has more than ${limits.MAX_CELLS_PER_ROW} cells`);
            }
          }
        } else {
          if (naming) {
            if (isNameByte(b) && name.length < 32) name += String.fromCharCode(b);
            else naming = false;
          }
          if (++run > limits.MAX_TEXT_RUN_BYTES) return fail("A cell is too large");
        }
        prev = b;
      }
      callback(null, chunk);
    },
  });
}

export type OpenEntryOptions = {
  tooBig?: () => Error;
  budget?: ByteBudget;
  /** Extra checks on the inflated bytes, e.g. xmlGuard(). */
  guard?: Transform;
  /** Refuse up front when the declared size is over the cap (default true). */
  precheck?: boolean;
};

/** The inflated bytes of one entry, capped at `max` (and at the shared budget). */
export async function openZipEntry(
  filePath: string,
  entry: ZipEntry,
  max: number,
  options: OpenEntryOptions = {},
): Promise<Readable> {
  const { tooBig = () => new XlsxFormatError(`${entry.name} is too large`), budget, guard, precheck = true } = options;
  if (entry.flags & 0x1) throw new XlsxFormatError("Encrypted workbooks are not supported");
  if (entry.compressedSize === ZIP64_MARKER || entry.uncompressedSize === ZIP64_MARKER) {
    throw new XlsxFormatError("ZIP64 workbooks are not supported");
  }
  // The declared size can lie; the cap below holds either way.
  if (precheck && entry.uncompressedSize > max) throw tooBig();

  const handle = await fs.promises.open(filePath, "r");
  let header: Buffer;
  try {
    header = await readAt(handle, 30, entry.localHeaderOffset);
  } finally {
    await handle.close();
  }
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new XlsxFormatError("Corrupt zip entry");
  const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);

  if (entry.method !== 0 && entry.method !== 8) {
    throw new XlsxFormatError(`Unsupported zip compression method ${entry.method}`);
  }
  const raw: Readable = entry.compressedSize === 0
    ? Readable.from([])
    : fs.createReadStream(filePath, { start, end: start + entry.compressedSize - 1 });
  const stages: NodeJS.ReadWriteStream[] = [];
  if (entry.method === 8) stages.push(zlib.createInflateRaw());
  stages.push(byteCap(max, tooBig, budget));
  if (guard) stages.push(guard);
  return pipeline([raw, ...stages], () => {}) as unknown as Readable;
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
 * The worksheets of the workbook, in workbook order: at most MAX_SHEETS distinct parts,
 * each once. Consume (or close) each sheet before asking for the next one.
 */
export async function* streamXlsxSheets(
  filePath: string,
  limits: XlsxLimits = XLSX_LIMITS,
): AsyncGenerator<XlsxSheet> {
  const entries = await readZipDirectory(filePath);
  const budget: ByteBudget = { remaining: limits.MAX_TOTAL_BYTES };
  const guard = () => xmlGuard(limits);
  const part = async (name: string, max: number, withGuard = false) => {
    const entry = entries.get(name);
    return entry ? openZipEntry(filePath, entry, max, { budget, guard: withGuard ? guard() : undefined }) : null;
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

  const sharedStrings = await part("xl/sharedStrings.xml", limits.MAX_SHARED_STRINGS_BYTES, true);
  // Cells refer to shared strings by index, so an empty table is still needed.
  for await (const _ of reader._parseSharedStrings(sharedStrings ?? Readable.from([]))) void _;
  const styles = await part("xl/styles.xml", limits.MAX_STYLES_BYTES);
  if (styles) await reader._parseStyles(styles);

  const relById = new Map((reader.workbookRels ?? []).map((r) => [r.Id, r]));
  const seen = new Set<string>();
  for (const sheet of reader.model?.sheets ?? []) {
    if (seen.size >= limits.MAX_SHEETS) break;
    const rel = relById.get(sheet.rId);
    // Chartsheets and dialog sheets have no rows.
    if (!rel || (rel.Type && !rel.Type.endsWith("/worksheet"))) continue;
    const path = partPath(rel.Target);
    // workbook.xml can list the same part many times; it is read once.
    if (seen.has(path)) continue;
    const entry = entries.get(path);
    if (!entry) continue;
    seen.add(path);

    const stream = await openZipEntry(filePath, entry, limits.MAX_SHEET_BYTES, {
      tooBig: () => new SheetTooLargeError(`${path} is too large`),
      budget,
      guard: guard(),
      // Past the cap only this read ends; the rows before it are kept.
      precheck: false,
    });
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
