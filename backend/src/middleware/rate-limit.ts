/**
 * Per-route limits for @fastify/rate-limit, on top of the global 100/min per IP set in
 * app.ts. Pass one as `config: { rateLimit: … }` in a route's options.
 *
 * All of them run in the preHandler hook: the body is parsed by then (so the auth
 * limit can key on the email), and a route's own authGuard has already run (so the
 * per-user limits key on the user id rather than the IP).
 */
import type { FastifyRequest } from "fastify";

/** Brute-force guard for login and register. */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" } as const;

/** Routes that try a submitted secret live (an AI key, a Gmail app password). */
export const CREDENTIAL_CHECK_RATE_LIMIT = { max: 5, timeWindow: "1 minute" } as const;

/** Keyed by client IP plus the lower-cased email in the body, when there is one. */
export function authRateLimit(scope: string) {
  return {
    ...AUTH_RATE_LIMIT,
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => {
      const email = (req.body as { email?: unknown } | null | undefined)?.email;
      const who = typeof email === "string" ? email.trim().toLowerCase() : "";
      return `${scope}:${req.ip}:${who}`;
    },
  };
}

/** Keyed by the signed-in user; falls back to the IP if the route has no user. */
export function perUserRateLimit(
  scope: string,
  limit: { max: number; timeWindow: string } = CREDENTIAL_CHECK_RATE_LIMIT,
) {
  return {
    ...limit,
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => {
      const sub = (req.user as { sub?: number } | undefined)?.sub;
      return sub != null ? `${scope}:${sub}` : req.ip;
    },
  };
}
