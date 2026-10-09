import { createHash } from "node:crypto";
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

interface RefreshClaims {
  sub: number;
  rememberMe?: boolean;
}

/**
 * bcrypt only reads the first 72 bytes, and a JWT's first 72 bytes are its fixed header
 * plus the start of the payload, so two refresh tokens for the same user could share a
 * hash. SHA-256 first makes every byte of the token count.
 */
function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function refreshTokenMatches(token: string, storedHash: string): Promise<boolean> {
  if (await bcrypt.compare(tokenDigest(token), storedHash)) return true;
  // Hashes stored before the SHA-256 step. Those tokens lasted 7 days and are rotated on
  // first use, so this fallback can go once 7 days have passed since this shipped.
  return bcrypt.compare(token, storedHash);
}

export class AuthService {
  constructor(
    private repo: AuthRepo,
    private signAccess: (payload: object) => string,
  ) {}

  async register(name: string, email: string, password: string) {
    // Check if user already exists
    const existing = await this.repo.findByEmail(email);
    if (existing) {
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

    return this.issue(user, false);
  }

  async login(email: string, password: string, rememberMe = false) {
    const u = await this.repo.findByEmail(email);
    if (!u) {
      await bcrypt.compare(password, DUMMY_HASH);
      const e: any = new Error("Invalid credentials");
      e.statusCode = 401;
      throw e;
    }
    if (!(await bcrypt.compare(password, u.passwordHash))) {
      const e: any = new Error("Invalid credentials");
      e.statusCode = 401;
      throw e;
    }
    return this.issue(u, rememberMe);
  }

  async refresh(token: string) {
    let payload: RefreshClaims;
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshClaims;
    } catch {
      const e: any = new Error("Invalid refresh token");
      e.statusCode = 401;
      throw e;
    }
    const u = await this.repo.findById(payload.sub);
    if (!u || !u.refreshToken || !(await refreshTokenMatches(token, u.refreshToken))) {
      const e: any = new Error("Invalid refresh token");
      e.statusCode = 401;
      throw e;
    }
    // Keep the choice made at sign-in. Tokens from before remember-me existed were always
    // kept in localStorage, so they stay remembered.
    return this.issue(u, payload.rememberMe ?? true);
  }

  async logout(userId: number) {
    await this.repo.setRefreshToken(userId, null);
  }

  async me(userId: number) {
    const u = await this.repo.findById(userId);
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email };
  }

  private async issue(u: { id: number; name: string; email: string }, rememberMe: boolean) {
    const accessToken = this.signAccess({ sub: u.id, email: u.email });
    const claims: RefreshClaims = { sub: u.id, rememberMe };
    const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
      expiresIn: rememberMe ? REFRESH_TTL.remembered : REFRESH_TTL.session,
    });
    await this.repo.setRefreshToken(u.id, await bcrypt.hash(tokenDigest(refreshToken), 10));
    return {
      accessToken,
      refreshToken,
      rememberMe,
      user: { id: u.id, name: u.name, email: u.email },
    };
  }
}
