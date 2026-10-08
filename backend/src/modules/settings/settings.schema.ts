import { z } from "zod";
/** Gmail credential update — secret is write-only. */
export const updateGmailSchema = z.object({
  email: z.string().email(),
  appPassword: z.string().min(1),
});
export type UpdateGmailInput = z.infer<typeof updateGmailSchema>;

/** Gemini API key update — write-only. */
export const updateGeminiSchema = z.object({
  apiKey: z.string().min(1),
});
export type UpdateGeminiInput = z.infer<typeof updateGeminiSchema>;

/** Candidate profile — editable from the Settings UI. All fields optional so a
 *  partial form submission merges with the existing stored profile. */
export const candidateProfileSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  experience: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
});
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

/** Sending settings for the primary Gmail (per-campaign settings live on each campaign). */
export const updateSendingSchema = z.object({
  senderDailyLimit: z.number().int().min(1).max(2000),
});
export type UpdateSendingInput = z.infer<typeof updateSendingSchema>;

/** Template variables the send job already fills; custom fields must not shadow them. */
export const RESERVED_PROFILE_KEYS = [
  "company", "location", "candidateName", "name", "candidateEmail", "email", "phone",
  "role", "targetRole", "experience", "skills", "linkedin", "LinkedIn", "github",
  "GitHub", "portfolio", "Portfolio", "signature",
] as const;

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
