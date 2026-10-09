import type { ContactRow } from "./send-email.js";

/** Template variables that describe the recipient contact, e.g. {{company}}. */
export function buildContactVars(contact: ContactRow): Record<string, string> {
  return {
    company: contact.companyName,
    location: contact.location ?? "",
  };
}
