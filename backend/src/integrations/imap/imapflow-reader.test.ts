import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

const calls: string[] = [];

/** Mutable fake client the mocked ImapFlow constructor hands back. */
const fake = {
  connect: vi.fn(async () => { calls.push("connect"); }),
  logout: vi.fn(async () => { calls.push("logout"); }),
  close: vi.fn(() => { calls.push("close"); }),
  mailboxOpen: vi.fn(async (path: string, opts?: { readOnly?: boolean }): Promise<any> => {
    calls.push(`mailboxOpen:${path}:${opts?.readOnly ? "ro" : "rw"}`);
    return { path, uidValidity: 12345n, uidNext: 500, exists: 42 };
  }),
  search: vi.fn(async (_query: unknown, _opts?: unknown): Promise<number[]> => { calls.push("search"); return [10, 11]; }),
  fetchAll: vi.fn(async (_range: string, _q: unknown, _o?: unknown): Promise<any[]> => {
    calls.push("fetchAll");
    return [{
      uid: 10,
      seq: 1,
      size: 2048,
      threadId: "thr-1",
      flags: new Set<string>(),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: {
        subject: "Hello",
        messageId: "<a@b.com>",
        from: [{ name: "Alice", address: "alice@Example.COM" }],
        to: [{ address: "me@example.com" }],
      },
      bodyStructure: { type: "text/plain", part: "1" },
    }];
  }),
  download: vi.fn(async (_range: string, _part?: string, _opts?: unknown): Promise<any> => {
    calls.push("download");
    return { meta: { charset: "utf-8" }, content: Readable.from(["Plain body text"]) };
  }),
  list: vi.fn(async (): Promise<any[]> => {
    calls.push("list");
    return [
      { path: "INBOX", flags: new Set(["\\Inbox"]) },
      // Deliberately a localized name: resolution must come from the flag, not the name.
      { path: "[Gmail]/Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) },
    ];
  }),
  messageMove: vi.fn(async (_range: string, dest: string, _o?: unknown): Promise<any> => {
    calls.push(`messageMove:${dest}`);
    return { path: "INBOX", destination: dest };
  }),
};

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn(() => fake),
}));

const { ImapFlowMailReader } = await import("./imapflow-reader.js");

const creds = { user: "me@gmail.com", pass: "app-password" };

const window = {
  mailbox: "INBOX",
  since: new Date("2026-01-01T00:00:00Z"),
  sinceUid: 0,
  expectedUidValidity: null as string | null,
  maxMessages: 200,
  maxTextChars: 8000,
};

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  fake.mailboxOpen.mockImplementation(async (path: string, opts?: { readOnly?: boolean }): Promise<any> => {
    calls.push(`mailboxOpen:${path}:${opts?.readOnly ? "ro" : "rw"}`);
    return { path, uidValidity: 12345n, uidNext: 500, exists: 42 };
  });
  fake.search.mockImplementation(async () => { calls.push("search"); return [10, 11]; });
  fake.download.mockImplementation(async (): Promise<any> => {
    calls.push("download");
    return { meta: { charset: "utf-8" }, content: Readable.from(["Plain body text"]) };
  });
  fake.messageMove.mockImplementation(async (_r: string, dest: string): Promise<any> => {
    calls.push(`messageMove:${dest}`);
    return { path: "INBOX", destination: dest };
  });
});

describe("ImapFlowMailReader.verify", () => {
  it("connects, opens INBOX read-only, and logs out", async () => {
    const reader = new ImapFlowMailReader(creds);
    const identity = await reader.verify();

    expect(identity).toEqual({ uidValidity: "12345", uidNext: 500, exists: 42 });
    expect(calls).toEqual(["connect", "mailboxOpen:INBOX:ro", "logout"]);
  });

  it("carries UIDVALIDITY as a lossless string, not a number", async () => {
    fake.mailboxOpen.mockImplementationOnce(async (path: string) => ({
      path, uidValidity: 4294967295n, uidNext: 1, exists: 0,
    }));
    const identity = await new ImapFlowMailReader(creds).verify();
    expect(identity.uidValidity).toBe("4294967295");
  });
});

describe("ImapFlowMailReader.fetchWindow", () => {
  it("follows connect → open → search → fetch → download → logout", async () => {
    await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(calls).toEqual([
      "connect", "mailboxOpen:INBOX:ro", "search", "fetchAll", "download", "logout",
    ]);
  });

  it("opens the mailbox read-only — sorting must never modify Gmail", async () => {
    await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(fake.mailboxOpen).toHaveBeenCalledWith("INBOX", { readOnly: true });
  });

  it("searches by date when there is no usable cursor", async () => {
    await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(fake.search).toHaveBeenCalledWith({ since: window.since }, { uid: true });
  });

  it("searches by UID range when the cursor matches the live UIDVALIDITY", async () => {
    await new ImapFlowMailReader(creds).fetchWindow({
      ...window, sinceUid: 42, expectedUidValidity: "12345",
    });
    expect(fake.search).toHaveBeenCalledWith({ uid: "43:*" }, { uid: true });
  });

  it("falls back to a date search when UIDVALIDITY has changed", async () => {
    await new ImapFlowMailReader(creds).fetchWindow({
      ...window, sinceUid: 42, expectedUidValidity: "99999",
    });
    expect(fake.search).toHaveBeenCalledWith({ since: window.since }, { uid: true });
  });

  it("caps the download in bytes rather than streaming whole attachments", async () => {
    await new ImapFlowMailReader(creds).fetchWindow({ ...window, maxTextChars: 1000 });
    expect(fake.download).toHaveBeenCalledWith("10", "1", { uid: true, maxBytes: 4000 });
  });

  it("normalizes the sender and derives the domain", async () => {
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages[0]).toMatchObject({
      uid: 10,
      uidValidity: "12345",
      fromName: "Alice",
      fromAddress: "alice@Example.COM",
      fromDomain: "example.com",
      subject: "Hello",
      messageId: "<a@b.com>",
      gmailThreadId: "thr-1",
      text: "Plain body text",
      isUnread: true,
    });
  });

  it("marks a message read when Gmail reports the \\Seen flag", async () => {
    fake.fetchAll.mockImplementationOnce(async () => [{
      uid: 10, seq: 1, flags: new Set(["\\Seen"]),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: { subject: "s", from: [{ address: "a@b.com" }] },
      bodyStructure: { type: "text/plain", part: "1" },
    }]);
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages[0]!.isUnread).toBe(false);
  });

  it("prefers text/plain over text/html in a multipart message", async () => {
    fake.fetchAll.mockImplementationOnce(async () => [{
      uid: 10, seq: 1, flags: new Set<string>(),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: { subject: "s", from: [{ address: "a@b.com" }] },
      bodyStructure: {
        type: "multipart/alternative",
        childNodes: [
          { type: "text/html", part: "1.2" },
          { type: "text/plain", part: "1.1" },
        ],
      },
    }]);
    await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(fake.download).toHaveBeenCalledWith("10", "1.1", expect.anything());
  });

  it("falls back to text/html when there is no plain part, and flattens it", async () => {
    fake.fetchAll.mockImplementationOnce(async () => [{
      uid: 10, seq: 1, flags: new Set<string>(),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: { subject: "s", from: [{ address: "a@b.com" }] },
      bodyStructure: { type: "multipart/mixed", childNodes: [{ type: "text/html", part: "2" }] },
    }]);
    fake.download.mockImplementationOnce(async () => ({
      meta: { charset: "utf-8" },
      content: Readable.from(["<p>Hi <b>there</b></p>"]),
    }));
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages[0]!.text).toBe("Hi there");
  });

  it("ignores a text part the sender marked as an attachment", async () => {
    fake.fetchAll.mockImplementationOnce(async () => [{
      uid: 10, seq: 1, flags: new Set<string>(),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: { subject: "s", from: [{ address: "a@b.com" }] },
      bodyStructure: {
        type: "multipart/mixed",
        childNodes: [
          { type: "text/plain", part: "2", disposition: "attachment" },
          { type: "text/plain", part: "1" },
        ],
      },
    }]);
    await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(fake.download).toHaveBeenCalledWith("10", "1", expect.anything());
  });

  it("flags a message that carries an attachment", async () => {
    fake.fetchAll.mockImplementationOnce(async () => [{
      uid: 10, seq: 1, flags: new Set<string>(),
      internalDate: new Date("2026-01-10T08:00:00Z"),
      envelope: { subject: "s", from: [{ address: "a@b.com" }] },
      bodyStructure: {
        type: "multipart/mixed",
        childNodes: [
          { type: "text/plain", part: "1" },
          { type: "application/pdf", part: "2", disposition: "attachment" },
        ],
      },
    }]);
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages[0]!.hasAttachments).toBe(true);
  });

  it("still stores the message when its body cannot be downloaded", async () => {
    fake.download.mockImplementationOnce(async () => { throw new Error("part gone"); });
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.text).toBe("");
    expect(messages[0]!.subject).toBe("Hello");
  });

  it("takes the newest messages when the window exceeds maxMessages", async () => {
    fake.search.mockImplementationOnce(async () => [1, 2, 3, 4, 5]);
    await new ImapFlowMailReader(creds).fetchWindow({ ...window, maxMessages: 2 });
    expect(fake.fetchAll).toHaveBeenCalledWith("5,4", expect.anything(), { uid: true });
  });

  it("does not fetch at all when the search returns nothing", async () => {
    fake.search.mockImplementationOnce(async () => []);
    const { messages } = await new ImapFlowMailReader(creds).fetchWindow(window);
    expect(messages).toEqual([]);
    expect(fake.fetchAll).not.toHaveBeenCalled();
  });

  it("closes the connection even when the fetch throws", async () => {
    fake.fetchAll.mockImplementationOnce(async () => { throw new Error("boom"); });
    await expect(new ImapFlowMailReader(creds).fetchWindow(window)).rejects.toThrow("boom");
    expect(fake.logout).toHaveBeenCalled();
  });
});

describe("ImapFlowMailReader.moveToTrash", () => {
  it("resolves Trash from the \\Trash special-use flag, not a hardcoded name", async () => {
    const res = await new ImapFlowMailReader(creds).moveToTrash([10, 11]);
    expect(fake.messageMove).toHaveBeenCalledWith("10,11", "[Gmail]/Bin", { uid: true });
    expect(res).toEqual({ movedUids: [10, 11], failedUids: [] });
  });

  it("opens the mailbox read-write for the move", async () => {
    await new ImapFlowMailReader(creds).moveToTrash([10]);
    expect(fake.mailboxOpen).toHaveBeenCalledWith("INBOX");
  });

  it("reports per-UID outcomes when the server returns a uidMap", async () => {
    fake.messageMove.mockImplementationOnce(async (_r: string, dest: string) => ({
      path: "INBOX", destination: dest, uidMap: new Map([[10, 900]]),
    }));
    const res = await new ImapFlowMailReader(creds).moveToTrash([10, 11]);
    expect(res).toEqual({ movedUids: [10], failedUids: [11] });
  });

  it("treats a falsy move result as a total failure", async () => {
    fake.messageMove.mockImplementationOnce(async () => false);
    const res = await new ImapFlowMailReader(creds).moveToTrash([10, 11]);
    expect(res).toEqual({ movedUids: [], failedUids: [10, 11] });
  });

  it("throws a MAILBOX_GONE-shaped error when no Trash folder exists", async () => {
    fake.list.mockImplementationOnce(async () => [{ path: "INBOX", flags: new Set(["\\Inbox"]) }]);
    await expect(new ImapFlowMailReader(creds).moveToTrash([10]))
      .rejects.toMatchObject({ code: "NONEXISTENT" });
  });

  it("is a no-op for an empty uid list and opens no connection", async () => {
    const res = await new ImapFlowMailReader(creds).moveToTrash([]);
    expect(res).toEqual({ movedUids: [], failedUids: [] });
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("closes the connection even when the move throws", async () => {
    fake.messageMove.mockImplementationOnce(async () => { throw new Error("denied"); });
    await expect(new ImapFlowMailReader(creds).moveToTrash([10])).rejects.toThrow("denied");
    expect(fake.logout).toHaveBeenCalled();
  });
});

describe("ImapFlowMailReader.close", () => {
  it("is safe to call twice", async () => {
    const reader = new ImapFlowMailReader(creds);
    await reader.verify();
    await expect(reader.close()).resolves.toBeUndefined();
    await expect(reader.close()).resolves.toBeUndefined();
  });

  it("falls back to a hard close when logout fails", async () => {
    fake.logout.mockImplementationOnce(async () => { throw new Error("already gone"); });
    const reader = new ImapFlowMailReader(creds);
    await expect(reader.verify()).resolves.toBeDefined();
    expect(fake.close).toHaveBeenCalled();
  });
});
