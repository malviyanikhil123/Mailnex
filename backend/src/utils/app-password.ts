import { z } from "zod";

export const APP_PASSWORD_MESSAGE = "App password must be the 16-letter code from Google (spaces are fine)";

/**
 * Google shows app passwords as four groups of four letters ("abcd efgh ijkl mnop").
 * Strips spaces and dashes and lower-cases the rest; returns null unless exactly
 * 16 ASCII letters remain.
 */
export function normalizeAppPassword(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "").toLowerCase();
  return /^[a-z]{16}$/.test(compact) ? compact : null;
}

/** Zod field for a Gmail app password: accepts Google's spaced format, outputs the 16 bare letters. */
export const appPasswordSchema = z.string().transform((raw, ctx) => {
  const normalized = normalizeAppPassword(raw);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: APP_PASSWORD_MESSAGE });
    return z.NEVER;
  }
  return normalized;
});
