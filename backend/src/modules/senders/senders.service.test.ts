import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendersService } from "./senders.service.js";
import type { SendersRepo, SenderAccount } from "./senders.repo.js";

function makeRepo() {
  const rows: SenderAccount[] = [];
  return {
    rows,
    list: vi.fn(async () => rows),
    get: vi.fn(async (_userId: number, id: number) => rows.find((r) => r.id === id) ?? null),
    create: vi.fn(async (userId: number, values: Omit<SenderAccount, "id" | "userId" | "active" | "createdAt" | "updatedAt">) => {
      const row = { ...values, id: rows.length + 1, userId, active: true, createdAt: new Date(), updatedAt: new Date() };
      rows.push(row);
      return row;
    }),
    update: vi.fn(async (_userId: number, id: number, patch: Partial<SenderAccount>) => {
      const row = rows.find((r) => r.id === id);
      return row ? Object.assign(row, patch) : null;
    }),
    remove: vi.fn(async () => true),
  } as unknown as SendersRepo & { rows: SenderAccount[] } & Record<string, ReturnType<typeof vi.fn>>;
}

describe("SendersService", () => {
  const userId = 1;
  let repo: ReturnType<typeof makeRepo>;
  let verify: ReturnType<typeof vi.fn>;
  let service: SendersService;

  beforeEach(() => {
    repo = makeRepo();
    verify = vi.fn(async () => {});
    service = new SendersService(repo, verify);
  });

  it("stores the app password encrypted and never returns it", async () => {
    const pub = await service.create(userId, { label: "Sales", email: "sales@gmail.com", appPassword: "abcd efgh ijkl mnop", dailyLimit: 40 });
    expect(verify).toHaveBeenCalledWith("sales@gmail.com", "abcd efgh ijkl mnop");
    expect(repo.rows[0].appPasswordEnc).not.toContain("abcd efgh ijkl mnop");
    expect(JSON.stringify(pub)).not.toContain("abcd");
    expect(pub).not.toHaveProperty("appPasswordEnc");
    expect(JSON.stringify(await service.list(userId))).not.toContain(repo.rows[0].appPasswordEnc);
  });

  it("decrypts credentials only for sending", async () => {
    const pub = await service.create(userId, { label: "Sales", email: "sales@gmail.com", appPassword: "secret-pass", dailyLimit: 40 });
    expect(await service.getCreds(userId, pub.id)).toEqual({ email: "sales@gmail.com", password: "secret-pass", dailyLimit: 40 });
  });

  it("does not store credentials Gmail rejects", async () => {
    verify.mockRejectedValueOnce(new Error("535 Invalid login"));
    await expect(
      service.create(userId, { label: "Bad", email: "bad@gmail.com", appPassword: "wrong", dailyLimit: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("an inactive sender cannot be used for sending", async () => {
    const pub = await service.create(userId, { label: "Sales", email: "sales@gmail.com", appPassword: "p", dailyLimit: 40 });
    await service.update(userId, pub.id, { active: false });
    expect(await service.getCreds(userId, pub.id)).toBeNull();
  });

  it("rotating the app password re-verifies and re-encrypts it", async () => {
    const pub = await service.create(userId, { label: "Sales", email: "sales@gmail.com", appPassword: "old", dailyLimit: 40 });
    await service.update(userId, pub.id, { appPassword: "new-pass" });
    expect(verify).toHaveBeenLastCalledWith("sales@gmail.com", "new-pass");
    expect((await service.getCreds(userId, pub.id))?.password).toBe("new-pass");
  });
});
