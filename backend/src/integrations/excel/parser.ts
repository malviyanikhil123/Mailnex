import ExcelJS from "exceljs";
import { streamXlsxSheets, SheetTooLargeError, XLSX_LIMITS, type XlsxLimits } from "./xlsx-stream.js";
import { logger } from "../../utils/logger.js";
import { splitFullName } from "../../utils/person-name.js";
import { BUILTIN_TEMPLATE_VARS } from "../../config/constants.js";

/**
 * One spreadsheet row mapped onto contact fields. Built-in fields are null when the file
 * has no such column or the cell is blank; email is "" when the row has no address.
 */
export type ParsedContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  /** Every other column keyed by normalized header. Each row of a file has the same keys. */
  customFields: Record<string, string>;
};

export type ParseResult = {
  /** Non-empty data rows in the file (header excluded), skipped ones included. */
  total: number;
  /** Rows past MAX_ROWS, counted but never handed to onRow. */
  skipped: number;
  /** Keys of the columns stored in customFields, in column order. */
  customFieldKeys: string[];
};

export const IMPORT_LIMITS = {
  /** Extra columns kept per file; columns past this are ignored. */
  MAX_CUSTOM_FIELDS: 20,
  MAX_KEY_LENGTH: 40,
  /** Every stored value is cut to this many characters. */
  MAX_VALUE_LENGTH: 500,
  /** Rows past this are skipped. The upload itself is capped at 20 MB (app.ts). */
  MAX_ROWS: 100_000,
  /** A cell is read up to this many characters (values are stored cut to MAX_VALUE_LENGTH). */
  MAX_CELL_CHARS: 32_768,
} as const;

const HEADER_SCAN_ROWS = 10;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/**
 * Only the start of a cell is searched for an address: EMAIL_REGEX backtracks
 * quadratically, so one huge cell (the upload may be 20 MB) would block the event loop.
 */
const MAX_EMAIL_SCAN_LENGTH = 1000;
/** A surrogate half without its partner, e.g. left behind by cutting a value mid-emoji. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

type Field = "email" | "firstName" | "lastName" | "fullName" | "companyName" | "phone" | "website" | "location";

/** Exact header names per field, compared after headerKey() (lowercase, letters and digits only). */
const HEADER_ALIASES: Record<Field, string[]> = {
  email: [
    "email",
    "emails",
    "emailaddress",
    "emailaddresses",
    "emailid",
    "emailids",
    "hremail",
    "hremails",
    "recruiteremail",
    "recruiteremails",
    "contactemail",
    "contactemailaddress",
    "workemail",
    "officialemail",
    "primaryemail",
    "mail",
    "mailid",
    "agencyemail",
    "companyemail",
    "email1",
    "email2",
    "emailaddress1",
    "recruitmentagencyemail",
  ],
  firstName: ["firstname", "fname", "first", "givenname", "forename"],
  lastName: ["lastname", "lname", "last", "surname", "familyname"],
  fullName: ["name", "fullname", "contactname", "contactperson", "person", "personname", "displayname", "recipientname"],
  companyName: [
    "company",
    "companyname",
    "organization",
    "organisation",
    "organizationname",
    "organisationname",
    "org",
    "orgname",
    "business",
    "businessname",
    "firm",
    "firmname",
    "agency",
    "agencyname",
    "employer",
    "brand",
  ],
  phone: [
    "phone",
    "phonenumber",
    "phoneno",
    "telephone",
    "tel",
    "mobile",
    "mobilenumber",
    "mobileno",
    "cell",
    "cellphone",
    "contactnumber",
    "whatsapp",
  ],
  website: ["website", "web", "webpage", "site", "url", "homepage", "domain", "websiteurl", "companywebsite", "companyurl", "companydomain"],
  location: ["location", "city", "town", "place", "country", "state", "province", "region", "area", "address", "headquarters", "hq", "citystate"],
};

/**
 * Looser fallbacks for headers that are no exact alias, tried in this order so that
 * e.g. "Business Phone" is a phone and "Company Address" a location, not a company.
 */
const HEADER_PATTERNS: Array<[Field, (key: string) => boolean]> = [
  ["email", (k) => k.includes("email") || (k.includes("mail") && !k.includes("mailer") && !k.includes("mailing"))],
  ["phone", (k) => k.includes("phone") || k.includes("mobile")],
  ["website", (k) => k.includes("website") || k.includes("homepage")],
  ["location", (k) => k.includes("location") || k.includes("city") || k.includes("country") || k.includes("address")],
  ["firstName", (k) => k.includes("firstname") || k.includes("givenname")],
  ["lastName", (k) => k.includes("lastname") || k.includes("surname") || k.includes("familyname")],
  ["fullName", (k) => k.includes("fullname") || k.includes("contactperson")],
  ["companyName", (k) => k.includes("company") || k.includes("organization") || k.includes("organisation") || k.includes("business")],
];

const FIELDS = Object.keys(HEADER_ALIASES) as Field[];

type CustomColumn = { index: number; key: string };

function extractCellString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val).trim();
  if (val instanceof Date) {
    const iso = val.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    // Formula cells are read as their cached result, never as the formula itself.
    if ("formula" in obj || "sharedFormula" in obj) return extractCellString(obj.result);
    if ("error" in obj) return "";
    if (typeof obj.hyperlink === "string" && obj.hyperlink.startsWith("mailto:")) {
      return obj.hyperlink.replace(/^mailto:/i, "").trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((item: { text?: string }) => item?.text ?? "")
        .join("")
        .trim();
    }
    return "";
  }
  return String(val).trim();
}

function extractEmail(val: string): string {
  if (!val || !val.includes("@")) return "";
  const cleaned = val.slice(0, MAX_EMAIL_SCAN_LENGTH).replace(/^mailto:/i, "").trim();
  const match = cleaned.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : "";
}

/**
 * Values are kept as typed: trimmed, control characters (NUL included, which Postgres
 * rejects) turned into spaces, and length-capped. A leading = + - @ is deliberately NOT
 * stripped: phone numbers ("+1 …"), names and notes legitimately start with them and
 * templates must render them verbatim. Formula injection only matters when values are
 * written back into a spreadsheet, so CSV exports must neutralize such cells instead
 * (the contacts page export prefixes them with an apostrophe, which is dropped again
 * here so an exported file imports back unchanged). Lone surrogates (e.g. an emoji cut
 * in half by the length cap) are dropped: Postgres rejects them in jsonb (custom_fields).
 */
function cleanValue(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'(?=[=+\-@])/, "")
    .slice(0, IMPORT_LIMITS.MAX_VALUE_LENGTH)
    .replace(LONE_SURROGATE, "");
}

/** Header comparison key: case, spaces, underscores and punctuation are ignored. */
function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Template variable name for an extra column: "Job Title" → "job_title". */
export function customFieldKey(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, IMPORT_LIMITS.MAX_KEY_LENGTH)
    .replace(/_+$/, "");
}

/** Assigns each built-in field to at most one column; exact aliases win over patterns. */
function mapHeaderFields(cells: string[]): Partial<Record<Field, number>> {
  const fields: Partial<Record<Field, number>> = {};
  const claimed = new Set<number>();
  const keys = cells.map((cell) => (extractEmail(cell) ? "" : headerKey(cell)));

  keys.forEach((key, idx) => {
    const field = key && FIELDS.find((f) => fields[f] === undefined && HEADER_ALIASES[f].includes(key));
    if (field) {
      fields[field] = idx;
      claimed.add(idx);
    }
  });
  keys.forEach((key, idx) => {
    if (!key || claimed.has(idx)) return;
    // A pattern match on an already-assigned field leaves the column as a custom field.
    const match = HEADER_PATTERNS.find(([, test]) => test(key));
    if (match && fields[match[0]] === undefined) {
      fields[match[0]] = idx;
      claimed.add(idx);
    }
  });
  return fields;
}

const RESERVED_KEYS = new Set<string>(BUILTIN_TEMPLATE_VARS.map((k) => k.toLowerCase()));

/** Every column not used by a built-in field and holding a header or any value. */
function mapCustomColumns(
  header: string[] | null,
  dataRows: string[][],
  fields: Partial<Record<Field, number>>,
  /** Rows past the kept ones: how wide they get and which columns hold a value. */
  extra: { width: number; filled: ReadonlySet<number> } = { width: 0, filled: new Set() },
): CustomColumn[] {
  const used = new Set(Object.values(fields));
  const width = dataRows.reduce((max, r) => Math.max(max, r.length), Math.max(header?.length ?? 0, extra.width));
  const custom: CustomColumn[] = [];
  const taken = new Set<string>();

  for (let idx = 0; idx < width && custom.length < IMPORT_LIMITS.MAX_CUSTOM_FIELDS; idx++) {
    if (used.has(idx)) continue;
    const title = header?.[idx] ?? "";
    if (!title && !extra.filled.has(idx) && !dataRows.some((r) => r[idx])) continue;

    let base = customFieldKey(title) || `column_${idx + 1}`;
    // "LinkedIn" must not become {{linkedin}}, which the app fills from My Profile.
    if (RESERVED_KEYS.has(base)) base = `contact_${base}`.slice(0, IMPORT_LIMITS.MAX_KEY_LENGTH);
    let key = base;
    for (let n = 2; taken.has(key) || RESERVED_KEYS.has(key); n++) {
      const suffix = `_${n}`;
      key = base.slice(0, IMPORT_LIMITS.MAX_KEY_LENGTH - suffix.length) + suffix;
    }
    taken.add(key);
    custom.push({ index: idx, key });
  }
  return custom;
}

type HeaderInfo = { headerRowIdx: number; fields: Partial<Record<Field, number>> };

/**
 * The header is the first row naming an email column or two other known columns.
 * Scanning stops at the first row holding an address: that row is already data. Only
 * the first HEADER_SCAN_ROWS non-empty rows are looked at.
 */
function detectHeader(rows: string[][]): HeaderInfo {
  let headerRowIdx = -1;
  let fields: Partial<Record<Field, number>> = {};
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const cells = rows[r];
    if (cells.some((cell) => !!extractEmail(cell))) break;
    const found = mapHeaderFields(cells);
    if (found.email !== undefined || Object.keys(found).length >= 2) {
      headerRowIdx = r;
      fields = found;
      break;
    }
  }

  // No recognizable header: a first row without an address is still taken as a header
  // (its other titles become custom field names); otherwise every row is data.
  if (headerRowIdx === -1 && rows.length > 0 && !rows[0].some((cell) => !!extractEmail(cell))) {
    headerRowIdx = 0;
    fields = mapHeaderFields(rows[0]);
  }
  return { headerRowIdx, fields };
}

/** A cell as trimmed text, cut to IMPORT_LIMITS.MAX_CELL_CHARS. */
export function cellText(value: unknown): string {
  const text = extractCellString(value);
  return text.length > IMPORT_LIMITS.MAX_CELL_CHARS ? text.slice(0, IMPORT_LIMITS.MAX_CELL_CHARS) : text;
}

/**
 * One worksheet, read row by row. Only the first `keep` non-empty rows are held in
 * memory (the header candidates plus maxRows data rows). Later rows are counted and
 * summarised (how wide they are, which columns hold a value, where the first stray
 * address is) so the result is the same as reading the whole sheet.
 */
class SheetScan {
  /** Highest row number seen, like ExcelJS Worksheet.rowCount. */
  rowCount = 0;
  /** Non-empty rows, kept or not. */
  total = 0;
  readonly rows: string[][] = [];
  /** Set once rows run past `keep`; the header always lies within the kept rows. */
  header: HeaderInfo | null = null;
  extraWidth = 0;
  readonly extraFilled = new Set<number>();
  /** Column of the first address in an unclaimed column among the rows past `keep`. */
  extraEmailCol: number | undefined;

  constructor(private readonly keep: number) {}

  add(rowNumber: number, values: unknown): void {
    if (rowNumber > this.rowCount) this.rowCount = rowNumber;
    const rawValues = Array.isArray(values) ? values.slice(1) : [];
    const cells = Array.from(rawValues, cellText);
    if (!cells.some(Boolean)) return;
    this.total++;
    if (this.rows.length < this.keep) {
      this.rows.push(cells);
      return;
    }

    this.header ??= detectHeader(this.rows);
    if (cells.length > this.extraWidth) this.extraWidth = cells.length;
    cells.forEach((cell, i) => {
      if (cell) this.extraFilled.add(i);
    });
    if (this.extraEmailCol === undefined && this.header.fields.email === undefined) {
      const used = new Set(Object.values(this.header.fields));
      const idx = cells.findIndex((cell, i) => !used.has(i) && !!extractEmail(cell));
      if (idx !== -1) this.extraEmailCol = idx;
    }
  }
}

/**
 * Rows read from one workbook at most (Excel's own limit per sheet). A zip bomb can
 * hold far more; reading stops here, so the parse is bounded in time as well as memory.
 */
export const MAX_ROWS_READ = 1_048_576;

/** CSV is not compressed and the upload is capped, so it is read in one go. */
async function scanCsv(filePath: string, keep: number): Promise<SheetScan | null> {
  const workbook = new ExcelJS.Workbook();
  // Keep CSV cells as text: the default mapping turns "+1 555…" or "0123" into numbers.
  const worksheet = await workbook.csv.readFile(filePath, { map: (value: string) => (value === "" ? null : value) });
  if (!worksheet) return null;
  const scan = new SheetScan(keep);
  worksheet.eachRow((row, rowNumber) => scan.add(rowNumber, row.values));
  return scan;
}

/**
 * Streams an xlsx (see xlsx-stream.ts): the workbook is never inflated into memory as a
 * whole, and only the kept rows of the current and the best sheet so far are held. As
 * before, the sheet with the most rows wins (the first one on a tie).
 */
async function scanXlsx(
  filePath: string,
  keep: number,
  maxRowsRead: number,
  limits: XlsxLimits,
): Promise<SheetScan | null> {
  let best: SheetScan | null = null;
  let budget = maxRowsRead;
  for await (const sheet of streamXlsxSheets(filePath, limits)) {
    const scan = new SheetScan(keep);
    let stop = false;
    try {
      for await (const row of sheet.rows) {
        if (budget-- <= 0) {
          stop = true;
          logger.warn({ maxRowsRead }, "parseContactsXlsx: row budget reached; the rest of the workbook is not read");
          break;
        }
        scan.add(row.number, row.values);
      }
    } catch (err) {
      if (!(err instanceof SheetTooLargeError)) throw err;
      stop = true;
      logger.warn({ sheet: sheet.name }, "parseContactsXlsx: worksheet too large; the rest of the workbook is not read");
    } finally {
      sheet.close();
    }
    if (!best || scan.rowCount > best.rowCount) best = scan;
    if (stop) break;
  }
  return best;
}

/**
 * Reads an xlsx or csv file and maps every row onto contact fields. An xlsx is streamed
 * (ExcelJS WorkbookReader) so a small upload that inflates to a huge workbook cannot
 * exhaust memory: only the header candidates and the first maxRows data rows are kept.
 * Headers are matched case-, space- and underscore-insensitively (see HEADER_ALIASES) and
 * auto-detected on rows 1..10; a file without a recognizable header is read as data, with
 * the email found by scanning the cells. Columns that are no built-in field become
 * custom fields. Calls onRow for each non-empty data row (email lowercased, "" if none).
 */
export async function parseContactsXlsx(
  filePath: string,
  onRow: (row: ParsedContact, index: number) => void,
  options: { maxRows?: number; maxRowsRead?: number; xlsxLimits?: XlsxLimits } = {},
): Promise<ParseResult> {
  const maxRows = options.maxRows ?? IMPORT_LIMITS.MAX_ROWS;
  const keep = HEADER_SCAN_ROWS + maxRows;
  const scan = filePath.toLowerCase().endsWith(".csv")
    ? await scanCsv(filePath, keep)
    : await scanXlsx(filePath, keep, options.maxRowsRead ?? MAX_ROWS_READ, options.xlsxLimits ?? XLSX_LIMITS);

  const empty: ParseResult = { total: 0, skipped: 0, customFieldKeys: [] };
  if (!scan || scan.rows.length === 0) return empty;

  const detected = scan.header ?? detectHeader(scan.rows);
  const headerRowIdx = detected.headerRowIdx;
  const fields = { ...detected.fields };

  const header = headerRowIdx >= 0 ? scan.rows[headerRowIdx] : null;
  const dataRows = scan.rows.slice(headerRowIdx + 1);
  const totalData = scan.total - (headerRowIdx + 1);

  // Without an email header, the email column is wherever the first address shows up.
  if (fields.email === undefined) {
    logger.warn("parseContactsXlsx: no email column in the header; looking for addresses in every cell");
    const used = new Set(Object.values(fields));
    for (const cells of dataRows) {
      const idx = cells.findIndex((cell, i) => !used.has(i) && !!extractEmail(cell));
      if (idx !== -1) {
        fields.email = idx;
        break;
      }
    }
    if (fields.email === undefined && scan.extraEmailCol !== undefined) fields.email = scan.extraEmailCol;
  }

  const custom = mapCustomColumns(header, dataRows, fields, { width: scan.extraWidth, filled: scan.extraFilled });
  const rowsToRead = Math.min(totalData, maxRows);

  for (let r = 0; r < rowsToRead; r++) {
    const cells = dataRows[r];
    const get = (idx: number | undefined) => (idx === undefined ? "" : cleanValue(cells[idx]));

    let email = fields.email !== undefined ? extractEmail(cells[fields.email] ?? "") : "";
    // Fallback email detection: scan all cells in this row
    if (!email) {
      for (const cell of cells) {
        email = extractEmail(cell);
        if (email) break;
      }
    }

    let firstName = get(fields.firstName);
    let lastName = get(fields.lastName);
    if (!firstName && !lastName && fields.fullName !== undefined) {
      ({ firstName, lastName } = splitFullName(get(fields.fullName)));
    }

    const customFields: Record<string, string> = {};
    for (const col of custom) customFields[col.key] = get(col.index);

    onRow(
      {
        email: email.trim().toLowerCase(),
        firstName: firstName || null,
        lastName: lastName || null,
        companyName: get(fields.companyName) || null,
        phone: get(fields.phone) || null,
        website: get(fields.website) || null,
        location: get(fields.location) || null,
        customFields,
      },
      r,
    );
  }

  return {
    total: totalData,
    skipped: totalData - rowsToRead,
    customFieldKeys: custom.map((c) => c.key),
  };
}
