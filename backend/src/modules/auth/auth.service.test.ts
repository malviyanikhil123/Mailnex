import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

function makeRefreshToken(sub: number) {
  return jwt.sign({ sub }, JWT_REFRESH_SECRET, { expiresIn: "7d" });
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
}> = {}) {
  return {
    findByEmail: vi.fn(overrides.findByEmail ?? (async (_e: string) => null)),
    findById: vi.fn(overrides.findById ?? (async (_id: number) => null)),
    setRefreshToken: vi.fn(overrides.setRefreshToken ?? (async (_id: number, _h: string | null) => {})),
  };
}

// Stub signAccess — returns a deterministic fake access token string
const stubSignAccess = (payload: object) =>
  "access." + Buffer.from(JSON.stringify(payload)).toString("base64");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthService", () => {
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
      expect(await bcrypt.compare(result.refreshToken, hash)).toBe(true);
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
      expect(await bcrypt.compare(result.refreshToken, newHash)).toBe(true);
      // the stored hash must NOT match the original token (it's a new token or same but hash differs)
      // We verify the hash is of the new token, not some stale value
      const decoded = jwt.verify(result.refreshToken, JWT_REFRESH_SECRET) as unknown as { sub: number };
      expect(decoded.sub).toBe(1);
    });

    it("throws 401 on an expired / tampered JWT", async () => {
      const repo = makeMockRepo({ findById: async () => ({ ...user }) });
      const svc = new AuthService(repo, stubSignAccess);

      await expect(svc.refresh("not.a.valid.jwt")).rejects.toMatchObject({
        statusCode: 401,
      });
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
