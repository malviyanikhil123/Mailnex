import { z } from "zod";
import { BUILTIN_TEMPLATE_VARS } from "../../config/constants.js";
import { appPasswordSchema } from "../../utils/app-password.js";
/** Gmail credential update — secret is write-only. Any domain is allowed (Google Workspace). */
export const updateGmailSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address"),
  appPassword: appPasswordSchema,
});
export type UpdateGmailInput = z.infer<typeof updateGmailSchema>;

const emailCheck = z.string().email();

/** A web address with or without http(s)://, e.g. "acme.com" or "https://acme.com/about". */
export function isWebsite(value: string): boolean {
  if (/\s/.test(value)) return false;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // A real host name: dot-separated labels ending in a top-level domain (IDNs arrive as xn--).
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i.test(url.hostname);
}

/** The sender's "My Profile" — editable from the Settings UI. All fields optional so a
 *  partial form submission merges with the existing stored profile. */
export const senderProfileSchema = z.object({
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  /** Empty clears it; anything else must be an address. */
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || emailCheck.safeParse(v).success, "Enter a valid email address, or leave it empty")
    .optional(),
  phone: z.string().max(100).optional(),
  /** Empty clears it; otherwise a URL or a bare domain such as acme.com. */
  website: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isWebsite(v), "Enter a website like acme.com or https://acme.com, or leave it empty")
    .optional(),
  linkedin: z.string().max(500).optional(),
  /** Multi-line sign-off; when empty a default is built from name/company/phone/website. */
  signature: z.string().max(2000).optional(),
});
export type SenderProfileInput = z.infer<typeof senderProfileSchema>;

/** Stored profile JSON. Profiles saved by the old job-seeker form also carry these keys;
 *  they are no longer edited but still fill the legacy template variables. */
export type SenderProfile = SenderProfileInput & {
  role?: string;
  experience?: string;
  skills?: string | string[];
  github?: string;
  portfolio?: string;
};

/** Sending settings for the primary Gmail (per-campaign settings live on each campaign). */
export const updateSendingSchema = z.object({
  senderDailyLimit: z.number().int().min(1).max(2000),
});
export type UpdateSendingInput = z.infer<typeof updateSendingSchema>;

/** Template variables the send job already fills; custom fields must not shadow them. */
export const RESERVED_PROFILE_KEYS = BUILTIN_TEMPLATE_VARS;

/** Custom "My Profile" fields — the full list is replaced on save. */
export const profileFieldsSchema = z.object({
  fields: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, "Key must start with a letter and use only letters, digits or _")
          .refine((k) => !(RESERVED_PROFILE_KEYS as readonly string[]).includes(k), "This key is already a built-in variable"),
        label: z.string().trim().min(1).max(80),
        value: z.string().max(2000).default(""),
      }),
    )
    .max(50)
    .refine((f) => new Set(f.map((x) => x.key)).size === f.length, "Keys must be unique"),
});
export type ProfileFieldsInput = z.infer<typeof profileFieldsSchema>;
