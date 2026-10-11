/**
 * Per-route limits for @fastify/rate-limit, on top of the global 100/min per client
 * set in app.ts. Pass one as `config: { rateLimit: … }` in a route's options, or as a
 * failureLimiter pair of hooks when a route needs a second bucket.
 *
 * All of them run in the preHandler hook: the body is parsed by then (so the auth
 * limits can key on the email), and a route's own authGuard has already run (so the
 * per-user limits key on the user id rather than the IP).
 */
import { isIPv6 } from "node:net";
import type { FastifyRequest, onResponseAsyncHookHandler, preHandlerAsyncHookHandler } from "fastify";

/** Brute-force guard for login and register, per client and email. */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" } as const;

/**
 * Failed logins per email from anywhere: rotating client addresses (an IPv6 /64
 * holds 2^64 of them) cannot get past this one. A successful login clears it.
 */
export const LOGIN_EMAIL_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 } as const;

/** Routes that try a submitted secret live (an AI key, a Gmail app password). */
export const CREDENTIAL_CHECK_RATE_LIMIT = { max: 5, timeWindow: "1 minute" } as const;

/** The eight 16-bit groups of an IPv6 address, or null when it can't be expanded. */
function ipv6Groups(ip: string): number[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (g.includes(".")) {
        // Embedded IPv4 in the last 32 bits.
        const octets = g.split(".").map(Number);
        if (octets.length !== 4 || octets.some((o) => !(o >= 0 && o <= 255))) return null;
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  return groups.length === 8 ? groups : null;
}

/**
 * The rate-limit key for a client address: IPv4 as is (also when IPv4-mapped), IPv6
 * by its /64, since one host usually controls a whole /64.
 */
export function clientKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  const bare = ip.split("%")[0];
  if (!isIPv6(bare)) return ip;
  const groups = ipv6Groups(bare);
  if (!groups) return ip;
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

function bodyEmail(req: FastifyRequest): string {
  const email = (req.body as { email?: unknown } | null | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** Keyed by client (IPv6 by /64) plus the lower-cased email in the body, when there is one. */
export function authRateLimit(scope: string) {
  return {
    ...AUTH_RATE_LIMIT,
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => `${scope}:${clientKey(req.ip)}:${bodyEmail(req)}`,
  };
}

/**
 * Counts failed requests per key in a fixed window, in memory (at most `maxKeys`, oldest
 * dropped). @fastify/rate-limit runs only one of its limiters per request (a shared
 * "already ran" flag), so a route that needs a second bucket uses this one: `preHandler`
 * rejects once a key has `max` failures, `onResponse` counts 4xx/5xx answers (not its own
 * 429s) and clears the key on success, so the real owner logging in starts over.
 */
export function failureLimiter(opts: {
  max: number;
  windowMs: number;
  key: (req: FastifyRequest) => string | null;
  message: string;
  maxKeys?: number;
  now?: () => number;
}): { preHandler: preHandlerAsyncHookHandler; onResponse: onResponseAsyncHookHandler } {
  const { max, windowMs, key, message, maxKeys = 100_000, now = Date.now } = opts;
  const windows = new Map<string, { count: number; resetAt: number }>();

  const live = (k: string, t: number) => {
    const w = windows.get(k);
    if (w && w.resetAt <= t) {
      windows.delete(k);
      return undefined;
    }
    return w;
  };

  return {
    preHandler: async (req, reply) => {
      const k = key(req);
      if (k === null) return;
      const t = now();
      const w = live(k, t);
      if (w && w.count >= max) {
        reply.header("retry-after", Math.ceil((w.resetAt - t) / 1000));
        throw Object.assign(new Error(message), { statusCode: 429, name: "TooManyRequests" });
      }
    },
    onResponse: async (req, reply) => {
      const k = key(req);
      if (k === null) return;
      const status = reply.statusCode;
      if (status < 400) {
        windows.delete(k);
        return;
      }
      if (status === 429) return;
      const t = now();
      let w = live(k, t);
      if (!w) {
        w = { count: 0, resetAt: t + windowMs };
        windows.set(k, w);
        if (windows.size > maxKeys) windows.delete(windows.keys().next().value!);
      }
      w.count++;
    },
  };
}

/** Failed logins per lower-cased email, whatever address they come from. */
export function loginEmailLimiter() {
  return failureLimiter({
    max: LOGIN_EMAIL_RATE_LIMIT.max,
    windowMs: LOGIN_EMAIL_RATE_LIMIT.windowMs,
    key: (req) => bodyEmail(req) || null,
    message: "Too many failed logins for this account. Try again later.",
  });
}

/** Keyed by the signed-in user; falls back to the client address if the route has no user. */
export function perUserRateLimit(
  scope: string,
  limit: { max: number; timeWindow: string } = CREDENTIAL_CHECK_RATE_LIMIT,
) {
  return {
    ...limit,
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => {
      const sub = (req.user as { sub?: number } | undefined)?.sub;
      return sub != null ? `${scope}:${sub}` : clientKey(req.ip);
    },
  };
}
