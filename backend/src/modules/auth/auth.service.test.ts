import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const DAY = 24 * 60 * 60;

/** A refresh token as issued before remember-me existed (no claim, 7 days). */
function makeRefreshToken(sub: number) {
  return jwt.sign({ sub }, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

/** The service stores bcrypt(sha256(token)), so the whole token counts, not just 72 bytes. */
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function decodeRefresh(token: string) {
  return jwt.verify(token, JWT_REFRESH_SECRET) as unknown as {
    sub: number;
    rememberMe?: boolean;
    iat: number;
    exp: number;
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let user: {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  refreshToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("Admin@123", 10);
  user = {
    id: 1,
    name: "Admin",
    email: "admin@local",
    passwordHash,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

// ---------------------------------------------------------------------------
// Mock repo factory
// ---------------------------------------------------------------------------

function makeMockRepo(overrides: Partial<{
  findByEmail: (email: string) => Promise<typeof user | null>;
  findById: (id: number) => Promise<typeof user | null>;
  setRefreshToken: (id: number, hash: string | null) => Promise<void>;
  create: (data: { name: string; email: string; passwordHash: string }) => Promise<typeof user>;
}> = {}) {
  return {
    findByEmail: vi.fn(overrides.findByEmail ?? (async (_e: string) => null)),
    findById: vi.fn(overrides.findById ?? (async (_id: number) => null)),
    setRefreshToken: vi.fn(overrides.setRefreshToken ?? (async (_id: number, _h: string | null) => {})),
    create: vi.fn(overrides.create ?? (async (d) => ({ ...user, ...d }))),
  };
}

// Stub signAccess — returns a deterministic fake access token string
const stubSignAccess = (payload: object) =>
  "access." + Buffer.from(JSON.stringify(payload)).toString("base64");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Each case runs several real bcrypt rounds (cost 10), which can take seconds when the
// whole suite runs in parallel; the default 5s timeout made these flaky.
describe("AuthService", { timeout: 30_000 }, () => {
  describe("login", () => {
    it("returns accessToken, refreshToken and user on valid credentials", async () => {
      const repo = makeMockRepo({ findByEmail: async () => ({ ...user }) });
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.login("admin@local", "Admin@123");

      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { id: 1, name: "Admin", email: "admin@local" },
      });
      // refresh token must be a valid JWT
      const decoded = jwt.verify(result.refreshToken, JWT_REFRESH_SECRET) as unknown as { sub: number };
      expect(decoded.sub).toBe(1);
      // repo should have stored a hashed refresh token
      expect(repo.setRefreshToken).toHaveBeenCalledOnce();
      const [id, hash] = repo.setRefreshToken.mock.calls[0] as [number, string];
      expect(id).toBe(1);
      expect(await bcrypt.compare(digest(result.refreshToken), hash)).toBe(true);
    });

    it("throws 401 when user is not found", async () => {
      const repo = makeMockRepo({ findByEmail: async () => null });
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.login("nobody@local", "Admin@123")).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("throws 401 on wrong password", async () => {
      const repo = makeMockRepo({ findByEmail: async () => ({ ...user }) });
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.login("admin@local", "WrongPassword")).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe("refresh", () => {
    it("throws 401 when stored hash does not match the presented token", async () => {
      const differentToken = makeRefreshToken(1);
      const storedHash = await bcrypt.hash("some-other-token-entirely", 10);
      const userWithToken = { ...user, refreshToken: storedHash };
      const repo = makeMockRepo({
        findByEmail: async () => userWithToken,
        findById: async () => userWithToken,
      });
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.refresh(differentToken)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("returns new accessToken and refreshToken on valid token (rotation)", async () => {
      // Issue a real refresh token, hash it, put it on the user
      const originalToken = makeRefreshToken(1);
      const storedHash = await bcrypt.hash(originalToken, 10);
      const userWithToken = { ...user, refreshToken: storedHash };
      const repo = makeMockRepo({
        findByEmail: async () => userWithToken,
        findById: async () => userWithToken,
      });
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.refresh(originalToken);

      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      // repo must have stored the new hashed token
      expect(repo.setRefreshToken).toHaveBeenCalledOnce();
      const [id, newHash] = repo.setRefreshToken.mock.calls[0] as [number, string];
      expect(id).toBe(1);
      // new hash must match the returned refresh token (rotation stored correctly)
      expect(await bcrypt.compare(digest(result.refreshToken), newHash)).toBe(true);
      // the stored hash must NOT match the original token (it's a new token or same but hash differs)
      // We verify the hash is of the new token, not some stale value
      const decoded = jwt.verify(result.refreshToken, JWT_REFRESH_SECRET) as unknown as { sub: number };
      expect(decoded.sub).toBe(1);
    });

    it("rejects the original token after rotation (reuse attack)", async () => {
      // Use fake timers so that jwt.sign produces a different iat on each call,
      // guaranteeing the rotated token is a distinct JWT from the original.
      vi.useFakeTimers();
      const t0 = Date.now();
      vi.setSystemTime(t0);

      // Step 1: issue the original token at t0 and hash it as the "stored" value.
      const originalToken = makeRefreshToken(1);
      const originalHash = await bcrypt.hash(originalToken, 10);

      // Mutable state to simulate the DB row being updated after rotation.
      let storedRefreshToken: string | null = originalHash;

      const repo = makeMockRepo({
        findById: async () => ({ ...user, refreshToken: storedRefreshToken }),
      });
      // Override setRefreshToken so mutations to storedRefreshToken are visible to findById.
      repo.setRefreshToken.mockImplementation(async (_id: number, hash: string | null) => {
        storedRefreshToken = hash;
      });
      const svc = new AuthService(repo, stubSignAccess);

      // Advance clock by 2 seconds so the rotated token gets a different iat.
      vi.setSystemTime(t0 + 2000);

      // Step 2: first refresh call succeeds and rotates the stored hash.
      const result = await svc.refresh(originalToken);
      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      // setRefreshToken must have been called once with a new hash.
      expect(repo.setRefreshToken).toHaveBeenCalledOnce();
      const [, newHash] = repo.setRefreshToken.mock.calls[0] as [number, string];
      // The new hash must match the returned (rotated) refresh token, not the original.
      expect(await bcrypt.compare(digest(result.refreshToken), newHash)).toBe(true);
      // The rotated token is distinct from the original (different iat).
      expect(result.refreshToken).not.toBe(originalToken);
      expect(await bcrypt.compare(digest(originalToken), newHash)).toBe(false);

      // Step 3: replaying the original token must now fail with 401,
      // because storedRefreshToken is now newHash which doesn't match originalToken.
      await expect(svc.refresh(originalToken)).rejects.toMatchObject({
        statusCode: 401,
      });

      vi.useRealTimers();
    });

    it("throws 401 on an expired / tampered JWT", async () => {
      const repo = makeMockRepo({ findById: async () => ({ ...user }) });
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.refresh("not.a.valid.jwt")).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe("remember me", () => {
    /** Repo whose stored refresh hash follows setRefreshToken, like the real users row. */
    function makeStatefulRepo(u: typeof user) {
      let stored: string | null = null;
      const repo = makeMockRepo({
        findByEmail: async () => ({ ...u, refreshToken: stored }),
        findById: async () => ({ ...u, refreshToken: stored }),
      });
      repo.setRefreshToken.mockImplementation(async (_id: number, hash: string | null) => {
        stored = hash;
      });
      return repo;
    }

    it("defaults to a 1-day refresh token that is not remembered", async () => {
      const svc = new AuthService(makeStatefulRepo(user), stubSignAccess);

      const result = await svc.login("admin@local", "Admin@123");

      expect(result.rememberMe).toBe(false);
      const claims = decodeRefresh(result.refreshToken);
      expect(claims.rememberMe).toBe(false);
      expect(claims.exp - claims.iat).toBe(1 * DAY);
    });

    it("issues a 30-day refresh token when ticked", async () => {
      const svc = new AuthService(makeStatefulRepo(user), stubSignAccess);

      const result = await svc.login("admin@local", "Admin@123", true);

      expect(result.rememberMe).toBe(true);
      const claims = decodeRefresh(result.refreshToken);
      expect(claims.rememberMe).toBe(true);
      expect(claims.exp - claims.iat).toBe(30 * DAY);
    });

    it.each([true, false])("refresh keeps rememberMe=%s and its lifetime", async (rememberMe) => {
      const svc = new AuthService(makeStatefulRepo(user), stubSignAccess);
      const login = await svc.login("admin@local", "Admin@123", rememberMe);

      const result = await svc.refresh(login.refreshToken);

      expect(result.rememberMe).toBe(rememberMe);
      const claims = decodeRefresh(result.refreshToken);
      expect(claims.rememberMe).toBe(rememberMe);
      expect(claims.exp - claims.iat).toBe((rememberMe ? 30 : 1) * DAY);
    });

    it("keeps sessions from before remember-me signed in, as remembered", async () => {
      // Legacy token (no claim) whose hash was stored without the SHA-256 step.
      const legacyToken = makeRefreshToken(1);
      const repo = makeStatefulRepo(user);
      await repo.setRefreshToken(1, await bcrypt.hash(legacyToken, 10));
      repo.setRefreshToken.mockClear();
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.refresh(legacyToken);

      expect(result.rememberMe).toBe(true);
      expect(decodeRefresh(result.refreshToken).rememberMe).toBe(true);
      const [, newHash] = repo.setRefreshToken.mock.calls[0] as [number, string];
      expect(await bcrypt.compare(digest(result.refreshToken), newHash)).toBe(true);
    });

    it("rejects a replayed token even when the user id pushes iat past bcrypt's 72 bytes", async () => {
      vi.useFakeTimers();
      try {
        const t0 = Date.now();
        vi.setSystemTime(t0);
        const svc = new AuthService(makeStatefulRepo({ ...user, id: 123456 }), stubSignAccess);
        const original = await svc.login("admin@local", "Admin@123", true);

        vi.setSystemTime(t0 + 2000);
        const rotated = await svc.refresh(original.refreshToken);
        expect(rotated.refreshToken).not.toBe(original.refreshToken);

        await expect(svc.refresh(original.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("logout", () => {
    it("calls setRefreshToken with null", async () => {
      const repo = makeMockRepo();
      const svc = new AuthService(repo, stubSignAccess);

      await svc.logout(1);

      expect(repo.setRefreshToken).toHaveBeenCalledWith(1, null);
    });
  });

  describe("me", () => {
    it("returns user profile when found", async () => {
      const repo = makeMockRepo({ findById: async () => ({ ...user }) });
      const svc = new AuthService(repo, stubSignAccess);

      const result = await svc.me(1);

      expect(result).toEqual({ id: 1, name: "Admin", email: "admin@local" });
    });

    it("returns null when user not found", async () => {
      const repo = makeMockRepo({ findById: async () => null });
      const svc = new AuthService(repo, stubSignAccess);

      expect(await svc.me(99)).toBeNull();
    });
  });
});
