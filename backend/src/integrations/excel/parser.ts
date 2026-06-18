import ExcelJS from "exceljs";

export type ContactRow = {
  companyName: string;
  location: string;
  email: string;
};

/**
 * Streams an xlsx file using ExcelJS WorkbookReader.
 * Maps header columns companyName/location/email (case-insensitive).
 * Calls onRow for each data row with trimmed/lowercased email.
 * Returns total number of data rows (excluding header).
 */
export async function parseContactsXlsx(
  filePath: string,
  onRow: (row: ContactRow, index: number) => void,
): Promise<number> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
  const headerIndexes: Record<string, number> = {};
  let dataRowCount = 0;
  let headerParsed = false;

  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      // ExcelJS row.values is 1-indexed (index 0 is null/undefined)
      const values = row.values as (string | null | undefined)[];
      const cells = values.slice(1);

      if (!headerParsed) {
        // Parse header row — map column names to 0-based cell indexes
        cells.forEach((cell, idx) => {
          const key = String(cell ?? "").trim().toLowerCase();
          if (key === "companyname") headerIndexes["companyName"] = idx;
          else if (key === "location") headerIndexes["location"] = idx;
          else if (key === "email") headerIndexes["email"] = idx;
        });
        headerParsed = true;
        continue;
      }

      const getString = (key: string): string =>
        String(cells[headerIndexes[key] ?? -1] ?? "").trim();

      const contactRow: ContactRow = {
        companyName: getString("companyName"),
        location: getString("location"),
        email: getString("email").toLowerCase(),
      };

      onRow(contactRow, dataRowCount);
      dataRowCount++;
    }
    break; // Only process the first worksheet
  }

  return dataRowCount;
}
