/**
 * classifyImapError — maps a raw IMAP/network error to an actionable code.
 *
 * Mirrors integrations/email/classify-failure.ts in shape and intent.
 *
 * The important judgement here is that AUTH_FAILED and IMAP_DISABLED are NOT
 * retryable. Gmail locks accounts after repeated authentication failures, so
 * retrying a wrong app password turns a typo into a lockout. Non-retryable is a
 * safety requirement, not a performance optimization.
 */

export type ImapErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "IMAP_DISABLED"
  | "NETWORK"
  | "MAILBOX_GONE"
  | "UNKNOWN";

export interface ClassifiedImapError {
  code: ImapErrorCode;
  message: string;
  retryable: boolean;
}

const AUTH_RE = /authenticationfailed|invalid credentials|application-specific password|username and password not accepted|auth.*fail/i;
/** Gmail signals a disabled-IMAP account as an [ALERT] string, not a status code. */
const IMAP_DISABLED_RE = /imap access is disabled|imap is disabled|\[alert\][\s\S]*imap/i;
const NETWORK_CODE_SET = new Set([
  "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "ECONNREFUSED",
  "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ESOCKET", "ERR_SSL_WRONG_VERSION_NUMBER",
]);
const NETWORK_MSG_RE = /socket|timed? ?out|timeout|network|connection closed|econn|tls|handshake/i;
const MAILBOX_GONE_RE = /nonexistent|unknown mailbox|uidvalidity|mailbox does not exist|trycreate/i;
const NOT_CONFIGURED_RE = /not_configured|no gmail credentials/i;

function safeStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function classifyImapError(err: unknown): ClassifiedImapError {
  let code: string | undefined;
  let message: string | undefined;
  let responseText: string | undefined;
  let explicit: string | undefined;

  if (err !== null && err !== undefined && typeof err === "object") {
    const o = err as Record<string, unknown>;
    code = safeStr(o["code"]);
    message = safeStr(o["message"]);
    // imapflow puts the server's reply here; it often carries the only useful detail.
    responseText = safeStr(o["responseText"]) ?? safeStr(o["response"]);
    // Set by our own factory/scheduler when credentials are absent.
    explicit = safeStr(o["imapCode"]);
  } else if (typeof err === "string") {
    message = err;
  }

  const text = [message, responseText, code].filter(Boolean).join(" ") || "Unknown IMAP error";
  const msgStr = message ?? responseText ?? "Unknown IMAP error";

  if (explicit === "NOT_CONFIGURED" || NOT_CONFIGURED_RE.test(text)) {
    return {
      code: "NOT_CONFIGURED",
      message: "No Gmail app password saved — add one in Settings to read your inbox.",
      retryable: false,
    };
  }

  // Checked before AUTH: Gmail's disabled-IMAP alert also mentions credentials.
  if (IMAP_DISABLED_RE.test(text)) {
    return {
      code: "IMAP_DISABLED",
      message: "IMAP is turned off for this Gmail account. Enable it in Gmail settings, then try again.",
      retryable: false,
    };
  }

  if (AUTH_RE.test(text)) {
    return {
      code: "AUTH_FAILED",
      message: "Gmail rejected the app password. Re-enter it in Settings — repeated attempts can lock the account.",
      retryable: false,
    };
  }

  if (MAILBOX_GONE_RE.test(text)) {
    return { code: "MAILBOX_GONE", message: msgStr, retryable: true };
  }

  if ((code && NETWORK_CODE_SET.has(code)) || NETWORK_MSG_RE.test(text)) {
    return { code: "NETWORK", message: msgStr, retryable: true };
  }

  return { code: "UNKNOWN", message: msgStr, retryable: true };
}
