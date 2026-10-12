const TITLE = /^(mr|mrs|ms|miss|mx|dr|prof)\.?$/i;

/**
 * Splits a full name into first and last name. The first word is the first name and
 * the rest (middle names included) the last name: "Ada King Lovelace" → Ada / King Lovelace.
 * A leading title is dropped ("Dr. Ada Lovelace"). "Lovelace, Ada" is read as
 * last-name-first; anything else after a comma is a suffix and dropped
 * ("Ada Lovelace, PhD" → Ada / Lovelace). A single word is a first name.
 */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.replace(/\s+/g, " ").trim().split(",").map((p) => p.trim());
  if (parts.length === 2 && parts[1] && !parts[0].includes(" ")) {
    return { firstName: parts[1], lastName: parts[0] };
  }
  const words = parts[0].split(" ").filter(Boolean);
  if (words.length > 1 && TITLE.test(words[0])) words.shift();
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}
