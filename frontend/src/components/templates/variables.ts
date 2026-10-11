import DOMPurify from "dompurify";
import type { Contact, ProfileField, SenderProfile } from "../../types/api";

export interface TemplateVariable {
  key: string;
  label: string;
}

/** Filled from Settings → My Profile. */
export const SENDER_VARIABLES: TemplateVariable[] = [
  { key: "my_name", label: "Your name" },
  { key: "my_company", label: "Your company" },
  { key: "my_email", label: "Your email" },
  { key: "my_phone", label: "Your phone" },
  { key: "my_website", label: "Your website" },
  { key: "my_linkedin", label: "Your LinkedIn" },
  { key: "signature", label: "Your signature" },
];

/** Filled from each contact. */
export const CONTACT_VARIABLES: TemplateVariable[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "full_name", label: "Full name" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "contact_email", label: "Email" },
  { key: "contact_phone", label: "Phone" },
  { key: "contact_website", label: "Website" },
];

export const SAMPLE_CONTACT: Record<string, string> = {
  first_name: "Jordan",
  last_name: "Lee",
  full_name: "Jordan Lee",
  company: "Acme Co",
  location: "Austin, TX",
  contact_email: "jordan@acme.example",
  contact_phone: "+1 555 0100",
  contact_website: "https://acme.example",
};

/** Same sign-off the server builds when the profile has no custom signature. */
function signatureOf(p: SenderProfile): string {
  if (p.signature?.trim()) return p.signature.trim();
  return ["Best regards,", p.name, p.company, p.phone, p.website]
    .filter((v): v is string => !!v?.trim())
    .map((v) => v.trim())
    .join("\n");
}

/** Mirrors the server's buildContactVars(): every built-in contact variable, "" when unknown. */
export function contactVars(contact: Contact): Record<string, string> {
  const firstName = contact.firstName?.trim() ?? "";
  const lastName = contact.lastName?.trim() ?? "";
  return {
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

/** Mirrors the server's buildContactCustomVars(): one variable per extra spreadsheet column. */
export function contactCustomVars(contact: Contact): Record<string, string> {
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries((contact.customFields ?? {}) as Record<string, unknown>)) {
    if (value === null || value === undefined || typeof value === "object") continue;
    custom[key] = String(value);
  }
  return custom;
}

/**
 * Values used by previews: the user's real profile (with placeholders where it is
 * empty), their custom fields, and a sample contact — or, given `contact`, that contact's
 * values and spreadsheet columns, layered the way the server does when sending.
 */
export function sampleVars(
  profile: SenderProfile = {},
  fields: ProfileField[] = [],
  contact: Contact | null = null,
): Record<string, string> {
  const p: SenderProfile = {
    name: profile.name?.trim() || "Alex Morgan",
    company: profile.company?.trim() || "Your Company",
    email: profile.email?.trim() || "you@example.com",
    phone: profile.phone?.trim() || "",
    website: profile.website?.trim() || "https://example.com",
    linkedin: profile.linkedin?.trim() || "",
    signature: profile.signature,
  };
  const profileFields = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  let contactValues: Record<string, string>;
  if (contact) {
    // Same order as the send job: a blank column doesn't hide the profile field of that name.
    const custom = contactCustomVars(contact);
    const filled = Object.fromEntries(Object.entries(custom).filter(([, v]) => v.trim() !== ""));
    contactValues = { ...custom, ...profileFields, ...filled, ...contactVars(contact) };
  } else {
    contactValues = { ...profileFields, ...SAMPLE_CONTACT };
  }
  return {
    ...contactValues,
    my_name: p.name ?? "",
    my_company: p.company ?? "",
    my_email: p.email ?? "",
    my_phone: p.phone ?? "",
    my_website: p.website ?? "",
    my_linkedin: p.linkedin ?? "",
    signature: signatureOf(p),
  };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * Mirrors the server's interpolate(): {{key}} (case-insensitive, unknown keys left as
 * written) and {{key|fallback}} (fallback when the value is blank or missing).
 */
export function interpolate(tpl: string, vars: Record<string, string>, escape: (v: string) => string = (v) => v): string {
  const lower = new Map(Object.entries(vars).map(([k, v]) => [k.toLowerCase(), v]));
  const lookup = (key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : lower.get(key.toLowerCase()));

  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const value = lookup(key);
    if (value !== undefined) return escape(value);
    const pipe = key.indexOf("|");
    if (pipe === -1) return match;
    const named = lookup(key.slice(0, pipe).trim());
    if (named !== undefined && named.trim() !== "") return escape(named);
    return key.slice(pipe + 1).trim();
  });
}

export interface TextPart {
  text: string;
  /** Set when this part is a {{placeholder}} that had no value (shown as a "no value" chip). */
  missing?: string;
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Splits filled-in text around the {{placeholders}} that were left without a value. */
export function splitMissing(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: m[0], missing: m[1]!.trim() });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Sanitized HTML document for the preview iframe (scripts never run there anyway). */
export function safePreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true });
}

/** An HTML template filled with `vars` (values escaped, line breaks kept), sanitized. */
export function renderHtmlPreview(body: string, vars: Record<string, string>): string {
  return safePreviewHtml(interpolate(body, vars, (v) => escapeHtml(v).replace(/\r\n|\r|\n/g, "<br>")));
}

/** Plain text written as simple HTML paragraphs, for switching a template to HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function looksLikeHtml(text: string): boolean {
  return /<(html|body|table|div|p|br|a|img|h[1-6])\b[^>]*>/i.test(text);
}
