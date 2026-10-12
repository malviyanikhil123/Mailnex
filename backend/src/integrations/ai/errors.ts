/**
 * Sorts AI SDK errors into the few cases callers act on differently.
 *
 * Provider bodies are matched loosely on purpose: Google reports a bad key as a 400
 * ("API key not valid"), the others as 401/403, and a model the key cannot use as 404.
 */

import { APICallError, RetryError } from "ai";

export type AiErrorKind =
  /** The provider refused the key (bad, revoked, or without access). */
  | "auth"
  /** The key works but the model id does not exist for it. */
  | "model"
  /** Rate limited or out of credits. */
  | "quota"
  /** Our own timeout fired. */
  | "timeout"
  /** Could not reach the provider, or it failed on its side (5xx). */
  | "network"
  | "unknown";

export interface AiErrorInfo {
  kind: AiErrorKind;
  statusCode?: number;
}

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown })?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export function classifyAiError(err: unknown): AiErrorInfo {
  // With retries on, the SDK wraps the attempts; the last one is what matters.
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (isAbortError(e)) return { kind: "timeout" };
  if (!APICallError.isInstance(e)) return { kind: "unknown" };

  const statusCode = e.statusCode;
  if (statusCode == null) return { kind: "network" };
  const body = `${e.responseBody ?? ""} ${e.message}`.toLowerCase();

  if (statusCode === 401 || statusCode === 403) return { kind: "auth", statusCode };
  if (statusCode === 400 && /api[ _-]?key|unauthori[sz]ed|authentication|permission/.test(body)) {
    return { kind: "auth", statusCode };
  }
  if (statusCode === 404 || (statusCode === 400 && body.includes("model"))) return { kind: "model", statusCode };
  if (statusCode === 429) return { kind: "quota", statusCode };
  if (statusCode >= 500) return { kind: "network", statusCode };
  return { kind: "unknown", statusCode };
}

/** A log-safe summary: no request body (it holds the prompt) and no headers. */
export function describeAiError(err: unknown): { kind: AiErrorKind; statusCode?: number; name?: string; message: string } {
  const info = classifyAiError(err);
  const e = err as { name?: string; message?: string };
  return { ...info, name: e?.name, message: String(e?.message ?? err).slice(0, 300) };
}
