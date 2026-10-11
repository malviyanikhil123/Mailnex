import { getEmailProvider } from "./factory.js";

/** Checks Gmail accepts the credentials; rejects with the SMTP error otherwise. */
export type VerifyCreds = (email: string, password: string) => Promise<void>;

/** Logs in to Gmail over SMTP with the credentials (nothing is sent). */
export const smtpVerify: VerifyCreds = (email, password) =>
  getEmailProvider({ provider: "gmail", gmail: { user: email, pass: password } }).verify();

export const GMAIL_REJECTED_MESSAGE =
  "Gmail rejected these credentials — check the address and the 16-character app password";

/**
 * Runs the check and turns any failure into a 400 with a message meant for the user,
 * so the SMTP error text (which may echo the address) is not passed on.
 */
export async function verifyGmailOrThrow(verify: VerifyCreds, email: string, password: string): Promise<void> {
  try {
    await verify(email, password);
  } catch {
    throw Object.assign(new Error(GMAIL_REJECTED_MESSAGE), { statusCode: 400 });
  }
}
