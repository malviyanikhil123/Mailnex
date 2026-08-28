import ExcelJS from "exceljs";
import { logger } from "../../utils/logger.js";

export type ContactRow = {
  companyName: string;
  location: string;
  email: string;
};

function extractCellString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val).trim();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
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

/**
 * Reads an xlsx file using ExcelJS Workbook.
 * Maps header columns companyName/location/email (case-insensitive).
 * Calls onRow for each data row with trimmed/lowercased email.
 * Returns total number of data rows (excluding header).
 */
export async function parseContactsXlsx(
  filePath: string,
  onRow: (row: ContactRow, index: number) => void,
): Promise<number> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return 0;

  const headerIndexes: Record<string, number> = {};
  let dataRowCount = 0;
  let headerParsed = false;

  worksheet.eachRow((row) => {
    // ExcelJS row.values is 1-indexed (index 0 is null/undefined)
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = rawValues.map(extractCellString);

    if (!headerParsed) {
      // Parse header row — map column names to 0-based cell indexes
      cells.forEach((cell, idx) => {
        const key = cell.toLowerCase().replace(/\s+/g, "");
        if (["company", "companyname", "company_name"].includes(key)) {
          headerIndexes.companyName = idx;
        } else if (["location", "city", "place"].includes(key)) {
          headerIndexes.location = idx;
        } else if (["email", "emailaddress", "email_address"].includes(key)) {
          headerIndexes.email = idx;
        }
      });
      headerParsed = true;

      // Warn if any expected column is absent
      const expectedColumns = ["companyName", "location", "email"] as const;
      const missingColumns = expectedColumns.filter((col) => !(col in headerIndexes));
      if (missingColumns.length > 0) {
        logger.warn(
          { missingColumns },
          `parseContactsXlsx: header missing expected column(s): ${missingColumns.join(", ")}`,
        );
      }

      return;
    }

    const getString = (key: string): string => {
      const idx = headerIndexes[key] ?? -1;
      return idx >= 0 && idx < cells.length ? cells[idx] : "";
    };

    const contactRow: ContactRow = {
      companyName: getString("companyName"),
      location: getString("location"),
      email: getString("email").toLowerCase(),
    };

    onRow(contactRow, dataRowCount);
    dataRowCount++;
  });

  return dataRowCount;
}
