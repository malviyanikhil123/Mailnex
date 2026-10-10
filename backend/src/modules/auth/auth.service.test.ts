import { createHash, randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthService, MAX_SESSIONS_PER_USER } from "./auth.service.js";
import type { AuthRepo, AuthSessionRow, UserRow } from "./auth.repo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const DAY = 24 * 60 * 60;
const PASSWORD = "Admin@123";

function sha256(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function decodeRefresh(token: string) {
  return jwt.verify(token, JWT_REFRESH_SECRET) as unknown as {
    sub: number;
    sid?: string;
    rememberMe?: boolean;
    iat: number;
    exp: number;
  };
}

/** A refresh token as issued before sessions existed: no sid, 7 days. */
function makeLegacyToken(sub: number) {
  return jwt.sign({ sub }, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

// Stub signAccess — returns a deterministic fake access token string
const stubSignAccess = (payload: object) =>
  "access." + Buffer.from(JSON.stringify(payload)).toString("base64");

// ---------------------------------------------------------------------------
// In-memory repo that behaves like the users + auth_sessions tables
// ---------------------------------------------------------------------------

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

function makeUser(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    name: "Admin",
    email: "admin@example.com",
    passwordHash,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function makeRepo(users: UserRow[] = [makeUser()]) {
  const sessions = new Map<string, AuthSessionRow>();
  const repo = {
    users,
    sessions,
    listByEmail: vi.fn(async (email: string, limit: number) =>
      users
        .filter((u) => u.email.toLowerCase() === email.toLowerCase())
        .sort((a, b) => a.id - b.id)
        .slice(0, limit),
    ),
    findById: vi.fn(async (id: number) => users.find((u) => u.id === id) ?? null),
    setRefreshToken: vi.fn(async (id: number, hash: string | null) => {
      const u = users.find((x) => x.id === id);
      if (u) u.refreshToken = hash;
    }),
    create: vi.fn(async (d: { name: string; email: string; passwordHash: string }) => {
      const u = makeUser({ ...d, id: users.length + 1 });
      users.push(u);
      return u;
    }),
    // Copies, like rows read from a database.
    findSession: vi.fn(async (id: string) => {
      const s = sessions.get(id);
      return s ? { ...s } : null;
    }),
    createSession: vi.fn(async (d: Parameters<AuthRepo["createSession"]>[0]) => {
      const now = new Date();
      sessions.set(d.id, {
        id: d.id,
        userId: d.userId,
        tokenHash: d.tokenHash,
        rememberMe: d.rememberMe ?? false,
        expiresAt: d.expiresAt,
        userAgent: d.userAgent ?? null,
        createdAt: now,
        lastUsedAt: now,
      });
    }),
    rotateSession: vi.fn(async (id: string, currentHash: string, next: { tokenHash: string; expiresAt: Date }) => {
      const s = sessions.get(id);
      if (!s || s.tokenHash !== currentHash) return false;
      Object.assign(s, next, { lastUsedAt: new Date() });
      return true;
    }),
    deleteSession: vi.fn(async (id: string, userId: number) => {
      if (sessions.get(id)?.userId === userId) sessions.delete(id);
    }),
    pruneSessions: vi.fn(async (_userId: number, _keep: number) => {}),
  } satisfies AuthRepo & Record<string, unknown>;
  return repo;
}

/** Inserts a session whose token was issued `ageSeconds` ago, so a refresh now yields a different token. */
async function seedSession(
  repo: ReturnType<typeof makeRepo>,
  { userId = 1, rememberMe = false, ageSeconds = 60 } = {},
) {
  const sid = randomUUID();
  const iat = Math.floor(Date.now() / 1000) - ageSeconds;
  const token = jwt.sign({ sub: userId, sid, rememberMe, iat }, JWT_REFRESH_SECRET, {
    expiresIn: rememberMe ? "30d" : "1d",
  });
  await repo.createSession({ id: sid, userId, tokenHash: sha256(token), rememberMe, expiresAt: new Date(Date.now() + DAY * 1000) });
  repo.createSession.mockClear();
  return { sid, token };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Each case runs real bcrypt rounds, which can take seconds when the whole suite runs in
// parallel; the default 5s timeout made these flaky.
describe("AuthService", { timeout: 30_000 }, () => {
  describe("login", () => {
    it("opens a new session holding only the SHA-256 of the refresh token", async () => {
      const repo = makeRepo();
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.login("admin@example.com", PASSWORD, { userAgent: "x".repeat(300) });

      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        rememberMe: false,
        user: { id: 1, name: "Admin", email: "admin@example.com" },
      });
      const claims = decodeRefresh(result.refreshToken);
      expect(claims).toMatchObject({ sub: 1, sid: expect.any(String), rememberMe: false });
      const session = repo.sessions.get(claims.sid!)!;
      expect(session).toMatchObject({ userId: 1, tokenHash: sha256(result.refreshToken), rememberMe: false });
      expect(session.expiresAt.getTime()).toBe(claims.exp * 1000);
      expect(session.userAgent).toHaveLength(255);
      expect(repo.pruneSessions).toHaveBeenCalledWith(1, MAX_SESSIONS_PER_USER);
    });

    it("throws 401 when user is not found", async () => {
      const svc = new AuthService(makeRepo([]), stubSignAccess);
      await expect(svc.login("nobody@example.com", PASSWORD)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws 401 on wrong password and opens no session", async () => {
      const repo = makeRepo();
      const svc = new AuthService(repo, stubSignAccess);
      await expect(svc.login("admin@example.com", "WrongPassword")).rejects.toMatchObject({ statusCode: 401 });
      expect(repo.sessions.size).toBe(0);
    });

    it("signs into whichever case-only duplicate account the password belongs to", async () => {
      const otherHash = await bcrypt.hash("Other@123", 4);
      const repo = makeRepo([
        makeUser({ id: 1, email: "Foo@x.com" }),
        makeUser({ id: 2, email: "foo@x.com", name: "Foo 2", passwordHash: otherHash }),
      ]);
      const svc = new AuthService(repo, stubSignAccess);

      expect((await svc.login("foo@x.com", PASSWORD)).user.id).toBe(1);
      expect((await svc.login("foo@x.com", "Other@123")).user.id).toBe(2);
      await expect(svc.login("foo@x.com", "nope")).rejects.toMatchObject({ statusCode: 401 });
    });

    it("still signs in when pruning old sessions fails", async () => {
      const repo = makeRepo();
      repo.pruneSessions.mockRejectedValueOnce(new Error("db hiccup"));
      const svc = new AuthService(repo, stubSignAccess);
      await expect(svc.login("admin@example.com", PASSWORD)).resolves.toMatchObject({ user: { id: 1 } });
    });
  });

  describe("remember me", () => {
    it("defaults to a 1-day session that is not remembered", async () => {
      const svc = new AuthService(makeRepo(), stubSignAccess);
      const claims = decodeRefresh((await svc.login("admin@example.com", PASSWORD)).refreshToken);
      expect(claims.rememberMe).toBe(false);
      expect(claims.exp - claims.iat).toBe(1 * DAY);
    });

    it("issues a 30-day session when ticked", async () => {
      const repo = makeRepo();
      const svc = new AuthService(repo, stubSignAccess);
      const result = await svc.login("admin@example.com", PASSWORD, { rememberMe: true });
      const claims = decodeRefresh(result.refreshToken);
      expect(result.rememberMe).toBe(true);
      expect(claims.exp - claims.iat).toBe(30 * DAY);
      expect(repo.sessions.get(claims.sid!)?.rememberMe).toBe(true);
    });

    it.each([true, false])("refresh keeps rememberMe=%s and its lifetime", async (rememberMe) => {
      const repo = makeRepo();
      const { token } = await seedSession(repo, { rememberMe });
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.refresh(token);

      expect(result.rememberMe).toBe(rememberMe);
      const claims = decodeRefresh(result.refreshToken);
      expect(claims.rememberMe).toBe(rememberMe);
      expect(claims.exp - claims.iat).toBe((rememberMe ? 30 : 1) * DAY);
    });
  });

  describe("refresh", () => {
    it("rotates the token of that session only", async () => {
      const repo = makeRepo();
      const a = await seedSession(repo);
      const b = await seedSession(repo);
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.refresh(a.token);

      expect(decodeRefresh(result.refreshToken).sid).toBe(a.sid);
      expect(repo.sessions.get(a.sid)?.tokenHash).toBe(sha256(result.refreshToken));
      expect(repo.sessions.get(b.sid)?.tokenHash).toBe(sha256(b.token));
      expect(repo.createSession).not.toHaveBeenCalled();
      // The other session is still usable.
      await expect(svc.refresh(b.token)).resolves.toMatchObject({ user: { id: 1 } });
    });

    it("rejects the previous token after rotation (reuse)", async () => {
      const repo = makeRepo();
      const { token } = await seedSession(repo);
      const svc = new AuthService(repo, stubSignAccess);

      const rotated = await svc.refresh(token);
      expect(rotated.refreshToken).not.toBe(token);

      await expect(svc.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
      await expect(svc.refresh(rotated.refreshToken)).resolves.toBeDefined();
    });

    it("lets only one of two simultaneous refreshes with the same token win", async () => {
      const repo = makeRepo();
      const { token } = await seedSession(repo);
      const svc = new AuthService(repo, stubSignAccess);

      const results = await Promise.allSettled([svc.refresh(token), svc.refresh(token)]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { statusCode: 401 } });
    });

    it("throws 401 for a revoked session, a foreign session or a tampered JWT", async () => {
      const repo = makeRepo([makeUser(), makeUser({ id: 2, email: "two@example.com" })]);
      const svc = new AuthService(repo, stubSignAccess);

      const revoked = await seedSession(repo);
      repo.sessions.delete(revoked.sid);
      await expect(svc.refresh(revoked.token)).rejects.toMatchObject({ statusCode: 401 });

      // Correctly signed, but claims a session that belongs to user 2.
      const theirs = await seedSession(repo, { userId: 2 });
      const forged = jwt.sign({ sub: 1, sid: theirs.sid, rememberMe: false }, JWT_REFRESH_SECRET, { expiresIn: "1d" });
      await expect(svc.refresh(forged)).rejects.toMatchObject({ statusCode: 401 });

      await expect(svc.refresh("not.a.valid.jwt")).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws 401 once the session row has expired, even if the JWT has not", async () => {
      const repo = makeRepo();
      const { sid, token } = await seedSession(repo);
      repo.sessions.get(sid)!.expiresAt = new Date(Date.now() - 1000);
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
      expect(repo.rotateSession).not.toHaveBeenCalled();
    });
  });

  describe("tokens from before sessions", () => {
    it.each([
      ["bcrypt(token)", (t: string) => bcrypt.hash(t, 4)],
      ["bcrypt(sha256(token))", (t: string) => bcrypt.hash(sha256(t), 4)],
    ])("are accepted once (%s) and turned into a remembered session", async (_label, hashOf) => {
      const legacy = makeLegacyToken(1);
      const repo = makeRepo([makeUser({ refreshToken: await hashOf(legacy) })]);
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.refresh(legacy);

      const claims = decodeRefresh(result.refreshToken);
      expect(result.rememberMe).toBe(true);
      expect(repo.sessions.get(claims.sid!)).toMatchObject({ userId: 1, rememberMe: true });
      expect(repo.users[0].refreshToken).toBeNull();
      await expect(svc.refresh(legacy)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("rejects one that does not match the stored hash", async () => {
      const repo = makeRepo([makeUser({ refreshToken: await bcrypt.hash("something-else", 4) })]);
      const svc = new AuthService(repo, stubSignAccess);
      await expect(svc.refresh(makeLegacyToken(1))).rejects.toMatchObject({ statusCode: 401 });
      expect(repo.sessions.size).toBe(0);
    });
  });

  describe("logout", () => {
    it("revokes only the session of the given refresh token", async () => {
      const repo = makeRepo();
      const current = await seedSession(repo);
      const other = await seedSession(repo);
      const svc = new AuthService(repo, stubSignAccess);

      await svc.logout(1, current.token);

      expect(repo.sessions.has(current.sid)).toBe(false);
      expect(repo.sessions.has(other.sid)).toBe(true);
      await expect(svc.refresh(current.token)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("still revokes with an expired refresh token", async () => {
      const repo = makeRepo();
      const sid = randomUUID();
      const expired = jwt.sign({ sub: 1, sid, rememberMe: false, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_REFRESH_SECRET);
      await repo.createSession({ id: sid, userId: 1, tokenHash: sha256(expired), rememberMe: false, expiresAt: new Date() });
      const svc = new AuthService(repo, stubSignAccess);

      await svc.logout(1, expired);

      expect(repo.sessions.has(sid)).toBe(false);
    });

    it("ignores another user's token and a missing token", async () => {
      const repo = makeRepo([makeUser(), makeUser({ id: 2, email: "two@example.com" })]);
      const theirs = await seedSession(repo, { userId: 2 });
      const svc = new AuthService(repo, stubSignAccess);

      await svc.logout(1, theirs.token);
      await svc.logout(1);

      expect(repo.sessions.has(theirs.sid)).toBe(true);
      expect(repo.deleteSession).not.toHaveBeenCalled();
    });

    it("clears the old single-token slot for a token from before sessions", async () => {
      const legacy = makeLegacyToken(1);
      const repo = makeRepo([makeUser({ refreshToken: "some-hash" })]);
      const svc = new AuthService(repo, stubSignAccess);

      await svc.logout(1, legacy);

      expect(repo.setRefreshToken).toHaveBeenCalledWith(1, null);
    });
  });

  describe("me", () => {
    it("returns user profile when found", async () => {
      const svc = new AuthService(makeRepo(), stubSignAccess);
      expect(await svc.me(1)).toEqual({ id: 1, name: "Admin", email: "admin@example.com" });
    });

    it("returns null when user not found", async () => {
      const svc = new AuthService(makeRepo(), stubSignAccess);
      expect(await svc.me(99)).toBeNull();
    });
  });
});
