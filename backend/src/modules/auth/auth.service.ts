import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema/settings.js";
import { campaignSettings } from "../../db/schema/campaign.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { TEMPLATE_SEED } from "../../db/seed/templates.js";
import { inboxSyncState } from "../../db/schema/inbox.js";
import { inboxService } from "../inbox/inbox.service.js";
import { logger } from "../../utils/logger.js";
import type { AuthRepo } from "./auth.repo.js";

// Fixed dummy hash used to equalize timing when a user is not found.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-placeholder", 10);

/** Refresh-token lifetimes. Every refresh issues a fresh token, so these are idle timeouts:
 *  "remember me" stays signed in while the app is used at least once every 30 days. */
export const REFRESH_TTL = { remembered: "30d", session: "1d" } as const;
/** Signed-in browsers/devices kept per user; a new sign-in beyond this drops the least recently used. */
export const MAX_SESSIONS_PER_USER = 20;
/** Login tries the password against at most this many case-insensitive email matches. */
const MAX_EMAIL_MATCHES = 5;
const USER_AGENT_MAX_LENGTH = 255;

interface RefreshClaims {
  sub: number;
  /** auth_sessions.id. Missing on tokens issued before sessions existed. */
  sid?: string;
  rememberMe?: boolean;
}

/** What the request tells us about the browser, stored on the session for reference. */
export interface ClientInfo {
  userAgent?: string;
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

const invalidRefresh = () => httpError(401, "Invalid refresh token");

/**
 * Refresh tokens are JWTs signed with a 256-bit HMAC, so unlike passwords they can't be
 * guessed: a plain SHA-256 keeps a leaked table useless, lets refresh skip bcrypt's cost,
 * and covers the whole token (bcrypt would only read its first 72 bytes).
 */
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks a pre-sessions token against users.refresh_token, which held bcrypt(token)
 *  (or briefly bcrypt(sha256(token))). Can go once those 7-day tokens have expired. */
async function legacyTokenMatches(token: string, storedHash: string): Promise<boolean> {
  return (await bcrypt.compare(tokenHash(token), storedHash)) || bcrypt.compare(token, storedHash);
}

export class AuthService {
  constructor(
    private repo: AuthRepo,
    private signAccess: (payload: object) => string,
  ) {}

  async register(name: string, email: string, password: string, client: ClientInfo = {}) {
    // Check if user already exists (case-insensitively)
    const existing = await this.repo.listByEmail(email, 1);
    if (existing.length > 0) {
      const e: any = new Error("An account with this email already exists");
      e.statusCode = 409;
      throw e;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.repo.create({ name, email, passwordHash });

    // Create default settings for the new user
    await db.insert(appSettings).values({
      userId: user.id,
      candidateProfile: JSON.stringify({ name, email }),
    }).onConflictDoNothing();

    await db.insert(campaignSettings).values({
      userId: user.id,
    }).onConflictDoNothing();

    // Seed default templates for the new user (all deselected by default)
    const templateRows = TEMPLATE_SEED.map((t) => ({ ...t, userId: user.id, active: false }));
    await db.insert(emailTemplates).values(templateRows).onConflictDoNothing();

    // Inbox Sorter: suggested categories + their starter rules, and the sync cursor.
    // Registration must still succeed if this fails — the user can seed from the UI.
    await db.insert(inboxSyncState).values({ userId: user.id }).onConflictDoNothing();
    try {
      await inboxService.seedDefaultCategories(user.id);
    } catch (err) {
      logger.warn({ err, userId: user.id }, "could not seed suggested inbox categories at registration");
    }

    return this.startSession(user, false, client);
  }

  async login(
    email: string,
    password: string,
    { rememberMe = false, ...client }: { rememberMe?: boolean } & ClientInfo = {},
  ) {
    // Usually one match. Accounts differing only by case (created before emails were
    // lower-cased) each get a try, so every one of them can still sign in.
    const candidates = await this.repo.listByEmail(email, MAX_EMAIL_MATCHES);
    if (candidates.length === 0) await bcrypt.compare(password, DUMMY_HASH);
    for (const u of candidates) {
      if (await bcrypt.compare(password, u.passwordHash)) return this.startSession(u, rememberMe, client);
    }
    throw httpError(401, "Invalid credentials");
  }

  /** Rotates the presented token's session; other sessions of the user are untouched. */
  async refresh(token: string) {
    let claims: RefreshClaims;
    try {
      claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshClaims;
    } catch {
      throw invalidRefresh();
    }
    if (!claims.sid) return this.convertLegacyToken(token, claims);

    const session = await this.repo.findSession(claims.sid);
    if (!session || session.userId !== claims.sub || !sameHash(tokenHash(token), session.tokenHash)) {
      throw invalidRefresh();
    }
    const u = await this.repo.findById(session.userId);
    if (!u) throw invalidRefresh();
    const { result, expiresAt } = this.sign(u, session.id, session.rememberMe);
    const rotated = await this.repo.rotateSession(session.id, session.tokenHash, {
      tokenHash: tokenHash(result.refreshToken),
      expiresAt,
    });
    // Another request with the same token rotated it first (e.g. two tabs at once).
    if (!rotated) throw invalidRefresh();
    return result;
  }

  /** Revokes only the session the given refresh token belongs to. Expired tokens are fine:
   *  the signature still proves which session it was. */
  async logout(userId: number, refreshToken?: string) {
    if (!refreshToken) return;
    let claims: RefreshClaims;
    try {
      claims = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, { ignoreExpiration: true }) as unknown as RefreshClaims;
    } catch {
      return;
    }
    if (claims.sub !== userId) return;
    if (claims.sid) await this.repo.deleteSession(claims.sid, userId);
    else await this.repo.setRefreshToken(userId, null);
  }

  async me(userId: number) {
    const u = await this.repo.findById(userId);
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email };
  }

  /** A refresh token from before sessions (hashed in users.refresh_token) is accepted once
   *  and turned into a session, so nobody is signed out by the switch. */
  private async convertLegacyToken(token: string, claims: RefreshClaims) {
    const u = await this.repo.findById(claims.sub);
    if (!u?.refreshToken || !(await legacyTokenMatches(token, u.refreshToken))) throw invalidRefresh();
    await this.repo.setRefreshToken(u.id, null);
    // Tokens from before remember-me were always kept in localStorage, so they stay remembered.
    return this.startSession(u, claims.rememberMe ?? true, {});
  }

  private async startSession(u: { id: number; name: string; email: string }, rememberMe: boolean, client: ClientInfo) {
    const sid = randomUUID();
    const { result, expiresAt } = this.sign(u, sid, rememberMe);
    await this.repo.createSession({
      id: sid,
      userId: u.id,
      tokenHash: tokenHash(result.refreshToken),
      rememberMe,
      expiresAt,
      userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) || null,
    });
    try {
      await this.repo.pruneSessions(u.id, MAX_SESSIONS_PER_USER);
    } catch (err) {
      logger.warn({ err, userId: u.id }, "could not prune old auth sessions");
    }
    return result;
  }

  private sign(u: { id: number; name: string; email: string }, sid: string, rememberMe: boolean) {
    const accessToken = this.signAccess({ sub: u.id, email: u.email });
    const claims: RefreshClaims = { sub: u.id, sid, rememberMe };
    const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
      expiresIn: rememberMe ? REFRESH_TTL.remembered : REFRESH_TTL.session,
    });
    const { exp } = jwt.decode(refreshToken) as { exp: number };
    return {
      expiresAt: new Date(exp * 1000),
      result: {
        accessToken,
        refreshToken,
        rememberMe,
        user: { id: u.id, name: u.name, email: u.email },
      },
    };
  }
}
