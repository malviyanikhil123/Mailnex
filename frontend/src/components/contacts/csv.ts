import type { Contact } from "../../types/api";

// Spreadsheet apps run a cell starting with one of these as a formula ("CSV injection").
// Imported values are stored verbatim, so every export must neutralize them here.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: formula-looking text gets a leading apostrophe, then RFC 4180 quoting. */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Contacts as CSV with the column names the importer recognizes, so the file can be
 * imported again; custom fields become extra columns.
 */
export function contactsToCsv(rows: Contact[]): string {
  const customKeys = [...new Set(rows.flatMap((c) => Object.keys(c.customFields ?? {})))];
  const header = ["first_name", "last_name", "email", "company", "phone", "website", "location", "status", ...customKeys];
  const lines = rows.map((c) =>
    [
      c.firstName,
      c.lastName,
      c.email,
      c.companyName,
      c.phone,
      c.website,
      c.location,
      c.status,
      ...customKeys.map((k) => c.customFields?.[k]),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function downloadCsv(fileName: string, csv: string) {
  // The BOM makes Excel open the file as UTF-8.
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
