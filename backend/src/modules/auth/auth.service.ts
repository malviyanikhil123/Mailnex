import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema/settings.js";
import { campaignSettings } from "../../db/schema/campaign.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { TEMPLATE_SEED } from "../../db/seed/templates.js";
import type { AuthRepo } from "./auth.repo.js";

// Fixed dummy hash used to equalize timing when a user is not found.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-placeholder", 10);

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

    return this.issue(user);
  }

  async login(email: string, password: string) {
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
    return this.issue(u);
  }

  async refresh(token: string) {
    let payload: any;
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    } catch {
      const e: any = new Error("Invalid refresh token");
      e.statusCode = 401;
      throw e;
    }
    const u = await this.repo.findById(payload.sub);
    if (!u || !u.refreshToken || !(await bcrypt.compare(token, u.refreshToken))) {
      const e: any = new Error("Invalid refresh token");
      e.statusCode = 401;
      throw e;
    }
    return this.issue(u);
  }

  async logout(userId: number) {
    await this.repo.setRefreshToken(userId, null);
  }

  async me(userId: number) {
    const u = await this.repo.findById(userId);
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email };
  }

  private async issue(u: { id: number; name: string; email: string }) {
    const accessToken = this.signAccess({ sub: u.id, email: u.email });
    const refreshToken = jwt.sign({ sub: u.id }, env.JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
    await this.repo.setRefreshToken(u.id, await bcrypt.hash(refreshToken, 10));
    return {
      accessToken,
      refreshToken,
      user: { id: u.id, name: u.name, email: u.email },
    };
  }
}
