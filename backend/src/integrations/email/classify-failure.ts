/**
 * classifyFailure — maps a raw Nodemailer (or unknown) error to a ClassifiedError.
 *
 * Classifier precedence (first match wins):
 *  1. QUOTA   — message matches /(daily.*limit|quota|550 5\.4\.5)/i
 *               → TEMPORARY + isQuota:true
 *               (quota takes precedence so the engine can pause, not bounce)
 *  2. PERMANENT — responseCode is 5xx  OR  message matches permanent keywords
 *               → PERMANENT + isQuota:false
 *  3. TEMPORARY — responseCode is 4xx, OR code in {ECONNRESET,ETIMEDOUT,ESOCKET},
 *               OR message matches /timeout|temporarily/i
 *               → TEMPORARY + isQuota:false
 *  4. DEFAULT  → TEMPORARY + isQuota:false
 */

import type { ClassifiedError, FailureType } from "./provider.js";

const PERMANENT_MSG_RE =
  /no such user|mailbox unavailable|address rejected|domain not found|user unknown/i;

const QUOTA_MSG_RE = /(daily.*limit|quota|550\s5\.4\.5)/i;

const TEMPORARY_CODE_SET = new Set(["ECONNRESET", "ETIMEDOUT", "ESOCKET"]);

const TEMPORARY_MSG_RE = /timeout|temporarily/i;

/** Safely extract string-typed properties from an unknown value. */
function safeStr(val: unknown): string | undefined {
  if (typeof val === "string") return val;
  return undefined;
}

function safeNum(val: unknown): number | undefined {
  if (typeof val === "number") return val;
  return undefined;
}

export function classifyFailure(err: unknown): ClassifiedError {
  // Pull out the properties we care about — handle any shape of err safely.
  let responseCode: number | undefined;
  let code: string | undefined;
  let message: string | undefined;

  if (err !== null && err !== undefined && typeof err === "object") {
    const o = err as Record<string, unknown>;
    responseCode = safeNum(o["responseCode"]);
    code = safeStr(o["code"]);
    message = safeStr(o["message"]);
  } else if (typeof err === "string") {
    message = err;
  }
  // null / undefined / number / other primitives → all fields remain undefined

  const codeStr = responseCode !== undefined
    ? String(responseCode)
    : (code ?? "UNKNOWN");

  const msgStr = message ?? "Unknown error";

  // Determine type + isQuota following the precedence rules.
  let type: FailureType = "TEMPORARY";
  let isQuota = false;

  // 1. Quota check (takes precedence over permanent 5xx)
  if (QUOTA_MSG_RE.test(msgStr)) {
    type = "TEMPORARY";
    isQuota = true;
    return { type, code: codeStr, message: msgStr, isQuota };
  }

  // 2. Permanent check
  const is5xx =
    responseCode !== undefined && responseCode >= 500 && responseCode < 600;
  const isPermanentMsg = PERMANENT_MSG_RE.test(msgStr);

  if (is5xx || isPermanentMsg) {
    type = "PERMANENT";
    return { type, code: codeStr, message: msgStr, isQuota };
  }

  // 3. Temporary check
  const is4xx =
    responseCode !== undefined && responseCode >= 400 && responseCode < 500;
  const isTempCode = code !== undefined && TEMPORARY_CODE_SET.has(code);
  const isTempMsg = TEMPORARY_MSG_RE.test(msgStr);

  if (is4xx || isTempCode || isTempMsg) {
    type = "TEMPORARY";
    return { type, code: codeStr, message: msgStr, isQuota };
  }

  // 4. Default
  return { type: "TEMPORARY", code: codeStr, message: msgStr, isQuota: false };
}
