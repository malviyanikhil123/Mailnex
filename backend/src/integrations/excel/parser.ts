import ExcelJS from "exceljs";
import { logger } from "../../utils/logger.js";

export type ContactRow = {
  companyName: string;
  location: string;
  email: string;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function extractCellString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val).trim();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.hyperlink === "string" && obj.hyperlink.startsWith("mailto:")) {
      return obj.hyperlink.replace(/^mailto:/i, "").trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if (typeof obj.result === "string" || typeof obj.result === "number") return String(obj.result).trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((item: { text?: string }) => item?.text ?? "")
        .join("")
        .trim();
    }
  }
  return String(val).trim();
}

function extractEmail(val: string): string {
  if (!val) return "";
  const cleaned = val.replace(/^mailto:/i, "").trim();
  const match = cleaned.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : "";
}

function isEmailHeader(key: string): boolean {
  if (
    [
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
    ].includes(key)
  ) {
    return true;
  }
  return (key.includes("email") || key.includes("mail")) && !key.includes("mailer") && !key.includes("mailinglist");
}

function isCompanyHeader(key: string): boolean {
  if (
    [
      "company",
      "companyname",
      "organization",
      "organizationname",
      "orgname",
      "agency",
      "agencyname",
      "recruitmentagency",
      "recruitingagency",
      "firm",
      "firmname",
      "business",
      "businessname",
      "client",
      "employer",
      "recruiter",
      "name",
    ].includes(key)
  ) {
    return true;
  }
  return key.includes("company") || key.includes("agency") || key.includes("organization") || key.includes("firm");
}

function isLocationHeader(key: string): boolean {
  if (
    [
      "location",
      "city",
      "place",
      "country",
      "state",
      "address",
      "region",
      "headquarters",
      "hq",
      "area",
      "citystate",
      "locationcity",
    ].includes(key)
  ) {
    return true;
  }
  return (
    key.includes("location") ||
    key.includes("city") ||
    key.includes("address") ||
    key.includes("country") ||
    key.includes("state")
  );
}

/**
 * Reads an xlsx or csv file using ExcelJS Workbook.
 * Maps header columns companyName/location/email (case-insensitive and tolerant of aliases).
 * Auto-detects headers on row 1..10 and falls back to cell-scanning for emails.
 * Calls onRow for each data row with trimmed/lowercased email.
 * Returns total number of data rows (excluding header).
 */
export async function parseContactsXlsx(
  filePath: string,
  onRow: (row: ContactRow, index: number) => void,
): Promise<number> {
  const workbook = new ExcelJS.Workbook();
  if (filePath.toLowerCase().endsWith(".csv")) {
    await workbook.csv.readFile(filePath);
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

  if (!worksheet) return 0;

  // Extract all rows as string arrays
  const allRawRows: string[][] = [];
  worksheet.eachRow((row) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    allRawRows.push(rawValues.map(extractCellString));
  });

  if (allRawRows.length === 0) return 0;

  let headerRowIdx = -1;
  const headerIndexes: { companyName?: number; location?: number; email?: number } = {};

  // Scan first 10 rows to detect header
  for (let r = 0; r < Math.min(allRawRows.length, 10); r++) {
    const cells = allRawRows[r];
    const tempIndexes: { companyName?: number; location?: number; email?: number } = {};

    cells.forEach((cell, idx) => {
      const key = cell.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key) return;

      if (isEmailHeader(key)) {
        if (tempIndexes.email === undefined) tempIndexes.email = idx;
      } else if (isCompanyHeader(key)) {
        if (tempIndexes.companyName === undefined) tempIndexes.companyName = idx;
      } else if (isLocationHeader(key)) {
        if (tempIndexes.location === undefined) tempIndexes.location = idx;
      }
    });

    if (
      tempIndexes.email !== undefined ||
      (tempIndexes.companyName !== undefined && tempIndexes.location !== undefined)
    ) {
      headerRowIdx = r;
      Object.assign(headerIndexes, tempIndexes);
      break;
    }
  }

  // If no header found, assume row 0 is header unless it directly contains an email
  if (headerRowIdx === -1) {
    const row0HasEmail = allRawRows[0]?.some((cell) => !!extractEmail(cell));
    if (row0HasEmail) {
      headerRowIdx = -1; // row 0 is already data
    } else {
      headerRowIdx = 0; // row 0 is assumed header
      allRawRows[0]?.forEach((cell, idx) => {
        const key = cell.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (isEmailHeader(key)) headerIndexes.email = idx;
        else if (isCompanyHeader(key)) headerIndexes.companyName = idx;
        else if (isLocationHeader(key)) headerIndexes.location = idx;
      });
    }
  }

  // Warn if any expected column is absent
  const expectedColumns = ["companyName", "location", "email"] as const;
  const missingColumns = expectedColumns.filter((col) => !(col in headerIndexes));
  if (missingColumns.length > 0) {
    logger.warn(
      { missingColumns },
      `parseContactsXlsx: header missing expected column(s): ${missingColumns.join(", ")}`,
    );
  }

  let dataRowCount = 0;
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < allRawRows.length; r++) {
    const cells = allRawRows[r];
    if (cells.every((c) => !c)) continue;

    let email = "";
    let emailColIdx = headerIndexes.email;
    if (emailColIdx !== undefined && emailColIdx < cells.length) {
      email = extractEmail(cells[emailColIdx]);
    }

    // Fallback email detection: scan all cells in this row
    if (!email) {
      for (let c = 0; c < cells.length; c++) {
        const found = extractEmail(cells[c]);
        if (found) {
          email = found;
          emailColIdx = c;
          break;
        }
      }
    }

    let companyName = "";
    if (headerIndexes.companyName !== undefined && headerIndexes.companyName < cells.length) {
      companyName = cells[headerIndexes.companyName];
    }
    // Fallback company name
    if (!companyName) {
      for (let c = 0; c < cells.length; c++) {
        if (
          c !== emailColIdx &&
          cells[c] &&
          !extractEmail(cells[c]) &&
          !/^https?:\/\//i.test(cells[c]) &&
          !/^\d+$/.test(cells[c])
        ) {
          companyName = cells[c];
          break;
        }
      }
    }

    let location = "";
    if (headerIndexes.location !== undefined && headerIndexes.location < cells.length) {
      location = cells[headerIndexes.location];
    }
    // Fallback location
    if (!location) {
      for (let c = 0; c < cells.length; c++) {
        if (
          c !== emailColIdx &&
          cells[c] &&
          cells[c] !== companyName &&
          !extractEmail(cells[c]) &&
          !/^https?:\/\//i.test(cells[c]) &&
          !/^\d+$/.test(cells[c])
        ) {
          location = cells[c];
          break;
        }
      }
    }

    const contactRow: ContactRow = {
      companyName: companyName.trim(),
      location: location.trim(),
      email: email.trim().toLowerCase(),
    };

    onRow(contactRow, dataRowCount);
    dataRowCount++;
  }

  return dataRowCount;
}
