import { z } from "zod";
import { BUILTIN_TEMPLATE_VARS } from "../../config/constants.js";
/** Gmail credential update — secret is write-only. */
export const updateGmailSchema = z.object({
  email: z.string().email(),
  appPassword: z.string().min(1),
});
export type UpdateGmailInput = z.infer<typeof updateGmailSchema>;

/** The sender's "My Profile" — editable from the Settings UI. All fields optional so a
 *  partial form submission merges with the existing stored profile. */
export const senderProfileSchema = z.object({
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(100).optional(),
  website: z.string().max(500).optional(),
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
