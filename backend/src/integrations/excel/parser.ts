import ExcelJS from "exceljs";
import { logger } from "../../utils/logger.js";
import { splitFullName } from "../../utils/person-name.js";

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
} as const;

const HEADER_SCAN_ROWS = 10;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

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
  if (!val) return "";
  const cleaned = val.replace(/^mailto:/i, "").trim();
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
 * here so an exported file imports back unchanged).
 */
function cleanValue(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'(?=[=+\-@])/, "")
    .slice(0, IMPORT_LIMITS.MAX_VALUE_LENGTH);
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

/** Every column not used by a built-in field and holding a header or any value. */
function mapCustomColumns(
  header: string[] | null,
  dataRows: string[][],
  fields: Partial<Record<Field, number>>,
): CustomColumn[] {
  const used = new Set(Object.values(fields));
  const width = dataRows.reduce((max, r) => Math.max(max, r.length), header?.length ?? 0);
  const custom: CustomColumn[] = [];
  const taken = new Set<string>();

  for (let idx = 0; idx < width && custom.length < IMPORT_LIMITS.MAX_CUSTOM_FIELDS; idx++) {
    if (used.has(idx)) continue;
    const title = header?.[idx] ?? "";
    if (!title && !dataRows.some((r) => r[idx])) continue;

    const base = customFieldKey(title) || `column_${idx + 1}`;
    let key = base;
    for (let n = 2; taken.has(key); n++) {
      const suffix = `_${n}`;
      key = base.slice(0, IMPORT_LIMITS.MAX_KEY_LENGTH - suffix.length) + suffix;
    }
    taken.add(key);
    custom.push({ index: idx, key });
  }
  return custom;
}

/**
 * Reads an xlsx or csv file using ExcelJS Workbook and maps every row onto contact fields.
 * Headers are matched case-, space- and underscore-insensitively (see HEADER_ALIASES) and
 * auto-detected on rows 1..10; a file without a recognizable header is read as data, with
 * the email found by scanning the cells. Columns that are no built-in field become
 * custom fields. Calls onRow for each non-empty data row (email lowercased, "" if none).
 */
export async function parseContactsXlsx(
  filePath: string,
  onRow: (row: ParsedContact, index: number) => void,
  options: { maxRows?: number } = {},
): Promise<ParseResult> {
  const maxRows = options.maxRows ?? IMPORT_LIMITS.MAX_ROWS;
  const workbook = new ExcelJS.Workbook();
  if (filePath.toLowerCase().endsWith(".csv")) {
    // Keep CSV cells as text: the default mapping turns "+1 555…" or "0123" into numbers.
    await workbook.csv.readFile(filePath, { map: (value: string) => (value === "" ? null : value) });
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  // Select the worksheet with the most rows
  let worksheet = workbook.worksheets[0];
  for (const ws of workbook.worksheets) {
    if (ws.rowCount > (worksheet?.rowCount ?? 0)) {
      worksheet = ws;
    }
  }

  const empty: ParseResult = { total: 0, skipped: 0, customFieldKeys: [] };
  if (!worksheet) return empty;

  // Extract all non-empty rows as string arrays
  const allRawRows: string[][] = [];
  worksheet.eachRow((row) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = Array.from(rawValues, extractCellString);
    if (cells.some(Boolean)) allRawRows.push(cells);
  });

  if (allRawRows.length === 0) return empty;

  // The header is the first row naming an email column or two other known columns.
  // Scanning stops at the first row holding an address: that row is already data.
  let headerRowIdx = -1;
  let fields: Partial<Record<Field, number>> = {};
  for (let r = 0; r < Math.min(allRawRows.length, HEADER_SCAN_ROWS); r++) {
    const cells = allRawRows[r];
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
  if (headerRowIdx === -1 && !allRawRows[0].some((cell) => !!extractEmail(cell))) {
    headerRowIdx = 0;
    fields = mapHeaderFields(allRawRows[0]);
  }

  const header = headerRowIdx >= 0 ? allRawRows[headerRowIdx] : null;
  const dataRows = allRawRows.slice(headerRowIdx + 1);

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
  }

  const custom = mapCustomColumns(header, dataRows, fields);
  const rowsToRead = Math.min(dataRows.length, maxRows);

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
    total: dataRows.length,
    skipped: dataRows.length - rowsToRead,
    customFieldKeys: custom.map((c) => c.key),
  };
}
