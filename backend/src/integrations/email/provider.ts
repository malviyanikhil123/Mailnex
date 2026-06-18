/**
 * Core email-provider abstractions.
 *
 * These types are consumed by the send-email job (Phase 9+) and by
 * the GmailProvider implementation (gmail-provider.ts).
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
}

export interface SendResult {
  messageId: string;
}

export interface EmailProvider {
  /** Human-readable provider name, e.g. "gmail" */
  name: string;
  /** Verify connectivity/credentials — resolves on success, rejects on failure */
  verify(): Promise<void>;
  /** Send a single email — resolves with a SendResult on success */
  send(msg: OutgoingEmail): Promise<SendResult>;
}

export type FailureType = "TEMPORARY" | "PERMANENT";

export interface ClassifiedError {
  type: FailureType;
  /** Stringified SMTP response code, nodemailer error code, or "UNKNOWN" */
  code: string;
  message: string;
  isQuota: boolean;
}
