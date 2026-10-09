import { z } from "zod";

export const APP_PASSWORDS_URL = "https://myaccount.google.com/apppasswords";
export const APP_PASSWORD_ERROR = "App password must be the 16-letter code from Google (spaces are fine)";

/** Mirrors backend utils/app-password.ts: drop spaces/dashes, expect exactly 16 letters. */
export function normalizeAppPassword(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "").toLowerCase();
  return /^[a-z]{16}$/.test(compact) ? compact : null;
}

export function appPasswordError(raw: string): string | null {
  return normalizeAppPassword(raw) ? null : APP_PASSWORD_ERROR;
}

// Same zod check as the backend; any domain is fine (Gmail, googlemail.com, Google Workspace).
const emailSchema = z.string().trim().max(254).email();

export function emailAddressError(raw: string): string | null {
  return emailSchema.safeParse(raw).success ? null : "Enter a valid email address";
}
