import { describe, it, expect, vi } from "vitest";
import { syncInboxJob, type SyncInboxDeps, type SyncStateRow } from "./sync-inbox.js";
import { INBOX } from "../config/constants.js";
import type { FetchedMessage, FetchWindow, MailReader } from "../integrations/imap/mail-reader.js";

const NOW = new Date("2026-01-15T10:00:00Z");

function fetched(uid: number, over: Partial<FetchedMessage> = {}): FetchedMessage {
  return {
    uid,
    uidValidity: "111",
    mailbox: "INBOX",
    messageId: `<msg-${uid}@example.com>`,
    gmailThreadId: null,
    fromName: "Sender",
    fromAddress: "sender@example.com",
    fromDomain: "example.com",
    toAddress: "me@example.com",
    subject: `Subject ${uid}`,
    receivedAt: new Date("2026-01-14T09:00:00Z"),
    isUnread: true,
    hasAttachments: false,
    sizeBytes: 1234,
    text: `Body of message ${uid}`,
    ...over,
  };
}

function state(over: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    uidValidity: null,
    lastSeenUid: 0,
    enabled: true,
    mailbox: "INBOX",
    nextAttemptAt: null,
    consecutiveFailures: 0,
    initialSyncDoneAt: null,
    ...over,
  };
}

interface Harness {
  deps: SyncInboxDeps;
  upsert: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
  fetchWindow: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getMailReader: ReturnType<typeof vi.fn>;
}

function harness(over: {
  state?: SyncStateRow | null;
  messages?: FetchedMessage[];
  uidValidity?: string;
  knownMessageIds?: string[];
  readerError?: unknown;
  fetchError?: unknown;
} = {}): Harness {
  const close = vi.fn(async () => {});
  const fetchWindow = vi.fn(async (_w: FetchWindow) => {
    if (over.fetchError) throw over.fetchError;
    return {
      identity: { uidValidity: over.uidValidity ?? "111", uidNext: 999, exists: 10 },
      messages: over.messages ?? [],
    };
  });

  const reader: MailReader = {
    name: "test-reader",
    verify: vi.fn(async () => ({ uidValidity: "111", uidNext: 999, exists: 10 })),
    fetchWindow: fetchWindow as unknown as MailReader["fetchWindow"],
    moveToTrash: vi.fn(async () => ({ movedUids: [], failedUids: [] })),
    close,
  };

  const getMailReader = vi.fn(async () => {
    if (over.readerError) throw over.readerError;
    return reader;
  });
  const upsert = vi.fn(async () => ({}));
  const insertMany = vi.fn(async (rows: unknown[]) => ({ inserted: rows.length }));

  const deps: SyncInboxDeps = {
    syncState: {
      get: async () => (over.state === undefined ? state() : over.state),
      upsert,
    },
    getMailReader: getMailReader as unknown as SyncInboxDeps["getMailReader"],
    messages: {
      existingMessageIds: async () => new Set(over.knownMessageIds ?? []),
      insertMany: insertMany as unknown as SyncInboxDeps["messages"]["insertMany"],
    },
    now: () => NOW,
  };

  return { deps, upsert, insertMany, fetchWindow, close, getMailReader };
}

describe("syncInboxJob", () => {
  it("asks for the 30-day window with no cursor on a first run", async () => {
    const h = harness({ state: state(), messages: [fetched(10)] });
    const r = await syncInboxJob(h.deps);

    expect(r.outcome).toBe("ok");
    const w = h.fetchWindow.mock.calls[0]![0] as FetchWindow;
    expect(w.sinceUid).toBe(0);
    expect(w.expectedUidValidity).toBeNull();
    expect(w.since).toEqual(new Date(NOW.getTime() - INBOX.SYNC_WINDOW_DAYS * 86_400_000));
    expect(w.maxMessages).toBe(INBOX.MAX_MESSAGES_PER_SYNC);
  });

  it("passes the stored cursor and its UIDVALIDITY on a later run", async () => {
    const h = harness({ state: state({ uidValidity: "111", lastSeenUid: 42 }), messages: [fetched(43)] });
    await syncInboxJob(h.deps);

    const w = h.fetchWindow.mock.calls[0]![0] as FetchWindow;
    expect(w.sinceUid).toBe(42);
    expect(w.expectedUidValidity).toBe("111");
  });

  it("advances lastSeenUid to the highest UID seen", async () => {
    const h = harness({
      state: state({ uidValidity: "111", lastSeenUid: 42 }),
      messages: [fetched(45), fetched(51), fetched(48)],
    });
    await syncInboxJob(h.deps);
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ lastSeenUid: 51, lastSyncStatus: "SUCCESS" }));
  });

  it("does not move lastSeenUid backwards when a tick returns nothing", async () => {
    const h = harness({ state: state({ uidValidity: "111", lastSeenUid: 42 }), messages: [] });
    await syncInboxJob(h.deps);
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ lastSeenUid: 42 }));
  });

  it("resets the cursor when the server's UIDVALIDITY has changed", async () => {
    const h = harness({
      state: state({ uidValidity: "111", lastSeenUid: 42 }),
      uidValidity: "222",
      messages: [fetched(3, { uidValidity: "222" })],
    });
    await syncInboxJob(h.deps);
    // The old cursor is not carried forward under the new UIDVALIDITY.
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ uidValidity: "222", lastSeenUid: 3 }));
  });

  it("counts a known Message-ID as a duplicate instead of inserting it", async () => {
    const h = harness({
      messages: [fetched(10), fetched(11)],
      knownMessageIds: ["<msg-10@example.com>"],
    });
    const r = await syncInboxJob(h.deps);

    expect(r.duplicates).toBe(1);
    expect(r.fetched).toBe(2);
    const rows = h.insertMany.mock.calls[0]![0] as Array<{ uid: number }>;
    expect(rows.map((x) => x.uid)).toEqual([11]);
  });

  it("still stores messages that carry no Message-ID", async () => {
    const h = harness({ messages: [fetched(10, { messageId: null }), fetched(11, { messageId: null })] });
    const r = await syncInboxJob(h.deps);
    expect(r.duplicates).toBe(0);
    expect(r.inserted).toBe(2);
  });

  it("derives a snippet and keeps the body text", async () => {
    const h = harness({ messages: [fetched(10, { text: "Hello there, this is the body." })] });
    await syncInboxJob(h.deps);
    const row = (h.insertMany.mock.calls[0]![0] as Array<{ snippet: string; bodyText: string }>)[0]!;
    expect(row.snippet).toBe("Hello there, this is the body.");
    expect(row.bodyText).toBe("Hello there, this is the body.");
  });

  it("skips a disabled account without opening a connection", async () => {
    const h = harness({ state: state({ enabled: false }) });
    const r = await syncInboxJob(h.deps);

    expect(r.outcome).toBe("skipped");
    expect(h.getMailReader).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("respects the backoff gate without opening a connection", async () => {
    const h = harness({ state: state({ nextAttemptAt: new Date(NOW.getTime() + 60_000) }) });
    const r = await syncInboxJob(h.deps);

    expect(r.outcome).toBe("skipped");
    expect(h.getMailReader).not.toHaveBeenCalled();
  });

  it("force overrides the backoff gate, for a user pressing Sync now", async () => {
    const h = harness({
      state: state({ nextAttemptAt: new Date(NOW.getTime() + 60_000) }),
      messages: [fetched(10)],
    });
    const r = await syncInboxJob(h.deps, { force: true });
    expect(r.outcome).toBe("ok");
    expect(h.getMailReader).toHaveBeenCalled();
  });

  it("gives a rejected app password the long flat backoff and never retries sooner", async () => {
    const h = harness({ readerError: { message: "Invalid credentials (Failure)" } });
    const r = await syncInboxJob(h.deps);

    expect(r.outcome).toBe("error");
    expect(r.errorCode).toBe("AUTH_FAILED");
    const patch = h.upsert.mock.calls[0]![0] as { nextAttemptAt: Date; lastSyncStatus: string };
    expect(patch.lastSyncStatus).toBe("ERROR");
    expect(patch.nextAttemptAt.getTime()).toBe(NOW.getTime() + INBOX.HARD_FAIL_BACKOFF_MS);
  });

  it("reports a missing app password as not_configured", async () => {
    const h = harness({ readerError: Object.assign(new Error("nope"), { imapCode: "NOT_CONFIGURED" }) });
    const r = await syncInboxJob(h.deps);
    expect(r.outcome).toBe("not_configured");
    expect(r.errorCode).toBe("NOT_CONFIGURED");
  });

  it("escalates the backoff for a retryable network error", async () => {
    const h = harness({
      state: state({ consecutiveFailures: 2 }),
      fetchError: { code: "ECONNRESET", message: "socket hang up" },
    });
    const r = await syncInboxJob(h.deps);

    expect(r.errorCode).toBe("NETWORK");
    const patch = h.upsert.mock.calls[0]![0] as { nextAttemptAt: Date; consecutiveFailures: number };
    expect(patch.consecutiveFailures).toBe(3);
    expect(patch.nextAttemptAt.getTime()).toBe(NOW.getTime() + INBOX.BACKOFF_MS[2]!);
  });

  it("caps the escalating backoff at the last step", async () => {
    const h = harness({
      state: state({ consecutiveFailures: 99 }),
      fetchError: { code: "ETIMEDOUT", message: "timeout" },
    });
    await syncInboxJob(h.deps);
    const patch = h.upsert.mock.calls[0]![0] as { nextAttemptAt: Date };
    expect(patch.nextAttemptAt.getTime()).toBe(NOW.getTime() + INBOX.BACKOFF_MS[INBOX.BACKOFF_MS.length - 1]!);
  });

  it("closes the connection even when the fetch throws", async () => {
    const h = harness({ fetchError: new Error("boom") });
    await syncInboxJob(h.deps);
    expect(h.close).toHaveBeenCalled();
  });

  it("closes the connection on a successful run", async () => {
    const h = harness({ messages: [fetched(10)] });
    await syncInboxJob(h.deps);
    expect(h.close).toHaveBeenCalled();
  });

  it("never throws out of the job", async () => {
    const h = harness({ fetchError: new Error("unexpected") });
    await expect(syncInboxJob(h.deps)).resolves.toMatchObject({ outcome: "error" });
  });

  it("stamps initialSyncDoneAt on the first success and keeps it afterwards", async () => {
    const first = harness({ state: state(), messages: [fetched(10)] });
    await syncInboxJob(first.deps);
    expect(first.upsert).toHaveBeenCalledWith(expect.objectContaining({ initialSyncDoneAt: NOW }));

    const earlier = new Date("2026-01-01T00:00:00Z");
    const later = harness({ state: state({ initialSyncDoneAt: earlier }), messages: [fetched(11)] });
    await syncInboxJob(later.deps);
    expect(later.upsert).toHaveBeenCalledWith(expect.objectContaining({ initialSyncDoneAt: earlier }));
  });

  it("works when there is no sync state row yet", async () => {
    const h = harness({ state: null, messages: [fetched(10)] });
    const r = await syncInboxJob(h.deps);
    expect(r.outcome).toBe("ok");
  });
});
