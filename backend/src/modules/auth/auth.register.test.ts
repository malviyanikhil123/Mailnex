import { describe, it, expect, vi } from "vitest";
import { AuthService } from "./auth.service.js";

const stubSignAccess = (payload: object) =>
  "access." + Buffer.from(JSON.stringify(payload)).toString("base64");

describe("AuthService (Multi-user Registration)", () => {
  it("rejects registration when email already exists", async () => {
    const existingUser = {
      id: 1,
      name: "Existing",
      email: "test@example.com",
      passwordHash: "hash",
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRepo = {
      findByEmail: vi.fn().mockResolvedValue(existingUser),
      findById: vi.fn().mockResolvedValue(null),
      setRefreshToken: vi.fn(),
      create: vi.fn(),
    };

    const svc = new AuthService(mockRepo, stubSignAccess);

    await expect(svc.register("New User", "test@example.com", "Password@123")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});
