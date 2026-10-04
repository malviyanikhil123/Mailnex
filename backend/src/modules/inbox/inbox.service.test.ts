import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboxService, inboxJobProgress } from "./inbox.service.js";
import type { InboxRepo } from "./inbox.repo.js";
import type { MailReader } from "../../integrations/imap/mail-reader.js";

const USER = 1;

/** Minimal in-memory stand-in for the parts of the repo each test touches. */
function fakeRepo(over: Partial<Record<keyof InboxRepo, unknown>> = {}) {
  const base = {
    listCategories: vi.fn(async () => []),
    getCategory: vi.fn(async (_u: number, id: number) => ({
      id, userId: USER, name: "Cat", slug: "cat", description: "", color: "#fff",
      sortOrder: 0, trackSubStatus: false, createdAt: new Date(), updatedAt: new Date(),
    })),
    createCategory: vi.fn(async (_u: number, v: Record<string, unknown>) => ({ id: 10, ...v })),
    updateCategory: vi.fn(async (_u: number, id: number, p: Record<string, unknown>) => ({ id, ...p })),
    deleteCategory: vi.fn(async () => ({ deleted: true, reassigned: 3 })),
    clearJobStatusForCategory: vi.fn(async () => 2),
    countCategories: vi.fn(async () => 1),
    createRule: vi.fn(async (_u: number, c: number, v: Record<string, unknown>) => ({ id: 5, categoryId: c, ...v })),
    getRule: vi.fn(async (_u: number, id: number) => ({
      id, categoryId: 10, value: "old", matchType: "CONTAINS" as const,
    })),
    updateRule: vi.fn(async (_u: number, id: number, p: Record<string, unknown>) => ({ id, ...p })),
    listAllForRuleTest: vi.fn(async () => []),
    setManualAssignment: vi.fn(async (_u: number, ids: number[]) => ids.length),
    getMessage: vi.fn(async (_u: number, id: number) => ({ id })),
    markTrashPending: vi.fn(async (_u: number, ids: number[]) =>
      ids.map((id) => ({ id, uid: id + 100, mailbox: "INBOX", uidValidity: "111" })),
    ),
    markTrashed: vi.fn(async (ids: number[]) => ids.length),
    revertTrashPending: vi.fn(async (ids: number[]) => ids.length),
    upsertSyncState: vi.fn(async () => ({})),
    stats: vi.fn(async () => ({ uncategorized: 0 })),
  };
  return { ...base, ...over } as unknown as InboxRepo;
}

function fakeReader(over: Partial<MailReader> = {}): MailReader {
  return {
    name: "test",
    verify: vi.fn(async () => ({ uidValidity: "111", uidNext: 2, exists: 1 })),
    fetchWindow: vi.fn(async () => ({ identity: { uidValidity: "111", uidNext: 2, exists: 1 }, messages: [] })),
    moveToTrash: vi.fn(async (uids: number[]) => ({ movedUids: uids, failedUids: [] })),
    close: vi.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => {
  inboxJobProgress.clear();
  vi.clearAllMocks();
});

describe("InboxService categories", () => {
  it("derives a slug from the name", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).createCategory(USER, { name: "Job Applications & Responses" });
    expect(repo.createCategory).toHaveBeenCalledWith(USER, expect.objectContaining({
      slug: "job-applications-responses",
    }));
  });

  it("rejects a name with no usable characters rather than storing an empty slug", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.createCategory(USER, { name: "!!!" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("recomputes the slug when the name changes", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).updateCategory(USER, 10, { name: "My Bills" });
    expect(repo.updateCategory).toHaveBeenCalledWith(USER, 10, expect.objectContaining({ slug: "my-bills" }));
  });

  it("clears stale job statuses when tracking is switched off", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).updateCategory(USER, 10, { trackSubStatus: false });
    expect(repo.clearJobStatusForCategory).toHaveBeenCalledWith(USER, 10);
  });

  it("does not clear job statuses when tracking is switched on", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).updateCategory(USER, 10, { trackSubStatus: true });
    expect(repo.clearJobStatusForCategory).not.toHaveBeenCalled();
  });

  it("404s when updating a category that does not exist", async () => {
    const repo = fakeRepo({ updateCategory: vi.fn(async () => null) });
    await expect(new InboxService({ repo }).updateCategory(USER, 99, { name: "x" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to reassign a category's mail to itself", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.deleteCategory(USER, 10, 10)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404s when the reassignment target does not exist", async () => {
    const repo = fakeRepo({
      getCategory: vi.fn(async (_u: number, id: number) => (id === 10 ? { id, trackSubStatus: false } : null)),
    });
    await expect(new InboxService({ repo }).deleteCategory(USER, 10, 77))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("reports how much mail a category delete re-bucketed", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.deleteCategory(USER, 10, null)).resolves.toEqual({ deleted: true, reassigned: 3 });
  });
});

describe("InboxService rules", () => {
  it("normalizes the rule value for matching while keeping what the user typed", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).createRule(USER, 10, { field: "SUBJECT", value: "  Payment   DUE " });
    expect(repo.createRule).toHaveBeenCalledWith(USER, 10, expect.objectContaining({
      value: "  Payment   DUE ",
      valueNormalized: "payment due",
    }));
  });

  it("drops a sub-status on a category that does not track one", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).createRule(USER, 10, {
      field: "SUBJECT", value: "interview", subStatus: "INTERVIEW_INVITE",
    });
    expect(repo.createRule).toHaveBeenCalledWith(USER, 10, expect.objectContaining({ subStatus: null }));
  });

  it("keeps a sub-status on a tracking category", async () => {
    const repo = fakeRepo({
      getCategory: vi.fn(async (_u: number, id: number) => ({ id, trackSubStatus: true })),
    });
    await new InboxService({ repo }).createRule(USER, 10, {
      field: "SUBJECT", value: "interview", subStatus: "INTERVIEW_INVITE",
    });
    expect(repo.createRule).toHaveBeenCalledWith(USER, 10, expect.objectContaining({
      subStatus: "INTERVIEW_INVITE",
    }));
  });

  it("rejects an invalid regex at save time instead of letting it silently never match", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.createRule(USER, 10, { field: "SUBJECT", matchType: "REGEX", value: "([unclosed" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts a valid regex", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.createRule(USER, 10, { field: "SUBJECT", matchType: "REGEX", value: "\\d{6}" }))
      .resolves.toBeDefined();
  });

  it("counts matches against stored mail for the dry run", async () => {
    const repo = fakeRepo({
      listAllForRuleTest: vi.fn(async () => [
        { id: 1, fromAddress: "a@b.com", fromDomain: "b.com", subject: "Your OTP code", bodyText: "", snippet: "s", receivedAt: new Date(), categoryId: null },
        { id: 2, fromAddress: "c@d.com", fromDomain: "d.com", subject: "Lunch?", bodyText: "", snippet: "s", receivedAt: new Date(), categoryId: null },
      ]),
    });
    const res = await new InboxService({ repo }).testRule(USER, { field: "SUBJECT", value: "otp" });
    expect(res.matches).toBe(1);
    expect(res.scanned).toBe(2);
    expect(res.sample).toHaveLength(1);
  });

  it("caps the dry-run sample at five", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, fromAddress: "a@b.com", fromDomain: "b.com", subject: "OTP", bodyText: "",
      snippet: "s", receivedAt: new Date(), categoryId: null,
    }));
    const repo = fakeRepo({ listAllForRuleTest: vi.fn(async () => many) });
    const res = await new InboxService({ repo }).testRule(USER, { field: "SUBJECT", value: "otp" });
    expect(res.matches).toBe(30);
    expect(res.sample).toHaveLength(5);
  });
});

describe("InboxService manual assignment", () => {
  it("keeps a job status only when the target category tracks one", async () => {
    const tracking = fakeRepo({
      getCategory: vi.fn(async (_u: number, id: number) => ({ id, trackSubStatus: true })),
    });
    await new InboxService({ repo: tracking }).setCategory(USER, 1, 10, "OFFER");
    expect(tracking.setManualAssignment).toHaveBeenCalledWith(USER, [1], 10, "OFFER");

    const plain = fakeRepo();
    await new InboxService({ repo: plain }).setCategory(USER, 1, 10, "OFFER");
    expect(plain.setManualAssignment).toHaveBeenCalledWith(USER, [1], 10, null);
  });

  it("never keeps a job status when moving to Uncategorized", async () => {
    const repo = fakeRepo();
    await new InboxService({ repo }).setCategory(USER, 1, null, "OFFER");
    expect(repo.setManualAssignment).toHaveBeenCalledWith(USER, [1], null, null);
  });

  it("404s when the message is not the caller's", async () => {
    const repo = fakeRepo({ setManualAssignment: vi.fn(async () => 0) });
    await expect(new InboxService({ repo }).setCategory(USER, 999, null, null))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("reports how many rows a bulk move changed", async () => {
    const svc = new InboxService({ repo: fakeRepo() });
    await expect(svc.bulkSetCategory(USER, { ids: [1, 2, 3], categoryId: 10 }))
      .resolves.toEqual({ updated: 3 });
  });
});

describe("InboxService deleteMessages (two-phase trash)", () => {
  it("marks TRASHED only after Gmail confirms the move", async () => {
    const repo = fakeRepo();
    const reader = fakeReader();
    const svc = new InboxService({ repo, getMailReader: async () => reader });

    const res = await svc.deleteMessages(USER, [1, 2]);

    expect(repo.markTrashPending).toHaveBeenCalledWith(USER, [1, 2]);
    expect(reader.moveToTrash).toHaveBeenCalledWith([101, 102], "INBOX");
    expect(repo.markTrashed).toHaveBeenCalledWith([1, 2]);
    expect(repo.revertTrashPending).not.toHaveBeenCalled();
    expect(res).toEqual({ requested: 2, trashed: 2, failed: 0, failures: [] });
  });

  it("restores a message to the inbox when Gmail refuses to move it", async () => {
    const repo = fakeRepo();
    const reader = fakeReader({ moveToTrash: vi.fn(async () => ({ movedUids: [101], failedUids: [102] })) });
    const svc = new InboxService({ repo, getMailReader: async () => reader });

    const res = await svc.deleteMessages(USER, [1, 2]);

    expect(repo.markTrashed).toHaveBeenCalledWith([1]);
    // The failed one goes BACK into the inbox — nothing is ever lost from Mailnex.
    expect(repo.revertTrashPending).toHaveBeenCalledWith([2], expect.stringMatching(/try again/i));
    expect(res.trashed).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.failures[0]).toMatchObject({ id: 2 });
  });

  it("restores every message when the IMAP connection itself fails", async () => {
    const repo = fakeRepo();
    const svc = new InboxService({
      repo,
      getMailReader: async () => { throw { code: "ECONNRESET", message: "socket hang up" }; },
    });

    const res = await svc.deleteMessages(USER, [1, 2]);

    expect(repo.markTrashed).not.toHaveBeenCalled();
    expect(repo.revertTrashPending).toHaveBeenCalledWith([1, 2], expect.any(String));
    expect(res).toMatchObject({ requested: 2, trashed: 0, failed: 2 });
    expect(res.failures).toHaveLength(2);
  });

  it("does not throw when the app password is missing — it reports and restores", async () => {
    const repo = fakeRepo();
    const svc = new InboxService({
      repo,
      getMailReader: async () => { throw Object.assign(new Error("x"), { imapCode: "NOT_CONFIGURED" }); },
    });
    const res = await svc.deleteMessages(USER, [1]);
    expect(res.failed).toBe(1);
    expect(res.failures[0]!.error).toMatch(/Settings/i);
    expect(repo.revertTrashPending).toHaveBeenCalled();
  });

  it("forces a full re-scan when the mailbox identity has drifted", async () => {
    const repo = fakeRepo();
    const svc = new InboxService({
      repo,
      getMailReader: async () => { throw { message: "NONEXISTENT Unknown Mailbox" }; },
    });
    await svc.deleteMessages(USER, [1]);
    expect(repo.upsertSyncState).toHaveBeenCalledWith(USER, { uidValidity: null, lastSeenUid: 0 });
  });

  it("closes the reader even when the move fails", async () => {
    const reader = fakeReader({ moveToTrash: vi.fn(async () => { throw new Error("denied"); }) });
    const svc = new InboxService({ repo: fakeRepo(), getMailReader: async () => reader });
    await svc.deleteMessages(USER, [1]);
    expect(reader.close).toHaveBeenCalled();
  });

  it("is a no-op when nothing was eligible, without touching IMAP", async () => {
    const repo = fakeRepo({ markTrashPending: vi.fn(async () => []) });
    const reader = fakeReader();
    const svc = new InboxService({ repo, getMailReader: async () => reader });

    const res = await svc.deleteMessages(USER, [1]);
    expect(res).toEqual({ requested: 1, trashed: 0, failed: 0, failures: [] });
    expect(reader.moveToTrash).not.toHaveBeenCalled();
  });

  it("groups the move per mailbox", async () => {
    const repo = fakeRepo({
      markTrashPending: vi.fn(async () => [
        { id: 1, uid: 101, mailbox: "INBOX", uidValidity: "111" },
        { id: 2, uid: 7, mailbox: "Archive", uidValidity: "111" },
      ]),
    });
    const reader = fakeReader();
    await new InboxService({ repo, getMailReader: async () => reader }).deleteMessages(USER, [1, 2]);

    expect(reader.moveToTrash).toHaveBeenCalledWith([101], "INBOX");
    expect(reader.moveToTrash).toHaveBeenCalledWith([7], "Archive");
  });
});

describe("InboxService job launching", () => {
  it("returns the same jobId for a double-clicked Sync now", async () => {
    let release: () => void = () => {};
    const svc = new InboxService({
      repo: fakeRepo(),
      runSync: () => new Promise((res) => { release = () => res({}); }),
    });

    const first = svc.startSync(USER);
    const second = svc.startSync(USER);
    expect(second.jobId).toBe(first.jobId);

    release();
    await new Promise((r) => setTimeout(r, 10));
  });

  it("refuses to classify before any category exists", async () => {
    const repo = fakeRepo({ countCategories: vi.fn(async () => 0) });
    const svc = new InboxService({ repo, runClassify: async () => ({}) });
    await expect(svc.startClassify(USER, "new")).rejects.toMatchObject({
      statusCode: 409, code: "NO_CATEGORIES",
    });
  });

  it("records a job failure on the progress entry instead of throwing", async () => {
    const svc = new InboxService({
      repo: fakeRepo(),
      runSync: async () => { throw { message: "Invalid credentials" }; },
    });
    const { jobId } = svc.startSync(USER);
    await new Promise((r) => setTimeout(r, 10));

    const progress = svc.getJobProgress(jobId);
    expect(progress.done).toBe(true);
    expect(progress.phase).toBe("failed");
    expect(progress.error).toMatch(/app password/i);
  });

  it("stores the result on a successful job", async () => {
    const svc = new InboxService({
      repo: fakeRepo(),
      runSync: async () => ({ outcome: "ok", inserted: 4 }),
    });
    const { jobId } = svc.startSync(USER);
    await new Promise((r) => setTimeout(r, 10));

    const progress = svc.getJobProgress(jobId);
    expect(progress.done).toBe(true);
    expect(progress.result).toMatchObject({ inserted: 4 });
  });

  it("404s for an unknown jobId, which the UI reads as done-or-lost", () => {
    const svc = new InboxService({ repo: fakeRepo() });
    expect(() => svc.getJobProgress("nope")).toThrowError(expect.objectContaining({ statusCode: 404 }));
  });
});

describe("InboxService verify", () => {
  it("returns the mailbox identity on success", async () => {
    const svc = new InboxService({ repo: fakeRepo(), getMailReader: async () => fakeReader() });
    await expect(svc.verify(USER)).resolves.toEqual({
      ok: true, mailbox: { uidValidity: "111", exists: 1 },
    });
  });

  it("turns a disabled-IMAP account into an actionable 400", async () => {
    const svc = new InboxService({
      repo: fakeRepo(),
      getMailReader: async () => { throw { message: "[ALERT] IMAP access is disabled" }; },
    });
    await expect(svc.verify(USER)).rejects.toMatchObject({ statusCode: 400, code: "IMAP_DISABLED" });
  });

  it("closes the reader after verifying", async () => {
    const reader = fakeReader();
    await new InboxService({ repo: fakeRepo(), getMailReader: async () => reader }).verify(USER);
    expect(reader.close).toHaveBeenCalled();
  });
});
