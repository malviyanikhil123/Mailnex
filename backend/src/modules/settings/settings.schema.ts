import { z } from "zod";
import { campaignMode } from "../../db/schema/enums.js";

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
  skills: z.array(z.string()).optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
});
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

/** Campaign settings update — mode/window/limit/testEmail/provider. */
export const updateCampaignSchema = z
  .object({
    mode: z.enum(campaignMode.enumValues as [string, ...string[]]).optional(),
    dailyLimit: z.number().int().min(1).max(2000).optional(),
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(1).max(24).optional(),
    testEmail: z.string().email().optional(),
    enabled: z.boolean().optional(),
    emailProvider: z.string().optional(),
  })
  .refine(
    (v) => v.startHour === undefined || v.endHour === undefined || v.startHour < v.endHour,
    { message: "startHour must be less than endHour" },
  );
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
