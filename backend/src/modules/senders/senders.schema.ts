import { z } from "zod";

/** New Gmail sender — the app password is write-only and stored encrypted. */
export const createSenderSchema = z.object({
  label: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  appPassword: z.string().trim().min(1),
  dailyLimit: z.number().int().min(1).max(2000).default(50),
});
export type CreateSenderInput = z.infer<typeof createSenderSchema>;

/** Partial update; send appPassword only to rotate it. */
export const updateSenderSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  appPassword: z.string().trim().min(1).optional(),
  dailyLimit: z.number().int().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});
export type UpdateSenderInput = z.infer<typeof updateSenderSchema>;
