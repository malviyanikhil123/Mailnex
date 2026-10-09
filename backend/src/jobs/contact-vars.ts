import type { ContactRow } from "./send-email.js";

/**
 * Template variables that describe the recipient contact, e.g. {{first_name}}, {{company}},
 * plus one per extra spreadsheet column ({{industry}}). Built-in variables win over a
 * custom field of the same name; every built-in is present ("" when unknown) so a
 * template never shows a raw {{placeholder}} for a contact that lacks the value.
 */
export function buildContactVars(contact: ContactRow): Record<string, string> {
  const firstName = contact.firstName?.trim() ?? "";
  const lastName = contact.lastName?.trim() ?? "";

  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(contact.customFields ?? {})) {
    if (value === null || value === undefined || typeof value === "object") continue;
    custom[key] = String(value);
  }

  return {
    ...custom,
    company: contact.companyName ?? "",
    location: contact.location ?? "",
    first_name: firstName,
    last_name: lastName,
    full_name: [firstName, lastName].filter(Boolean).join(" "),
    contact_email: contact.email,
    contact_phone: contact.phone ?? "",
    contact_website: contact.website ?? "",
  };
}
