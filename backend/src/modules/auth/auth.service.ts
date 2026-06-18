import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { AuthRepo } from "./auth.repo.js";

export class AuthService {
  constructor(
    private repo: AuthRepo,
    private signAccess: (payload: object) => string,
  ) {}

  async login(email: string, password: string) {
    const u = await this.repo.findByEmail(email);
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
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
