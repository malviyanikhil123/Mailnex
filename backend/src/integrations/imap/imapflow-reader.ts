/**
 * Gmail IMAP reader, the only place in the codebase that imports imapflow.
 *
 * Chosen over node-imap + mailparser because bodyStructure + download({maxBytes})
 * let us pull ONLY the text part with a hard byte cap. The mailparser route buffers
 * the whole MIME message, so a 25 MB attachment would be read over the wire and into
 * memory just to produce a 300-character snippet.
 */

import { ImapFlow } from "imapflow";
import type { ListResponse, MessageStructureObject } from "imapflow";
import { logger } from "../../utils/logger.js";
import { domainOf } from "../../utils/normalize-text.js";
import { toClassifiableText } from "./truncate.js";
import type {
  FetchWindow, FetchedMessage, MailReader, MailboxIdentity, TrashResult,
} from "./mail-reader.js";

export interface GmailImapCredentials {
  user: string;
  pass: string;
}

const FETCH_CHUNK = 50;

/** Walks the body structure for the best text part, preferring text/plain. */
function pickTextPart(node: MessageStructureObject | undefined): { part: string; isHtml: boolean } | null {
  if (!node) return null;

  let plain: string | null = null;
  let html: string | null = null;

  const walk = (n: MessageStructureObject): void => {
    const type = (n.type || "").toLowerCase();
    // Skip anything the sender marked as an attachment, even if it is text.
    const isAttachment = (n.disposition || "").toLowerCase() === "attachment";

    if (!isAttachment && n.part) {
      if (type === "text/plain" && plain === null) plain = n.part;
      else if (type === "text/html" && html === null) html = n.part;
    }
    for (const child of n.childNodes ?? []) walk(child);
  };
  walk(node);

  // A non-multipart message has no part number; "1" is the conventional reference.
  if (!plain && !html) {
    const type = (node.type || "").toLowerCase();
    if (type === "text/plain") return { part: "1", isHtml: false };
    if (type === "text/html") return { part: "1", isHtml: true };
    return null;
  }
  return plain ? { part: plain, isHtml: false } : { part: html!, isHtml: true };
}

function hasAttachment(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if ((node.disposition || "").toLowerCase() === "attachment") return true;
  return (node.childNodes ?? []).some(hasAttachment);
}

/** INTERNALDATE and envelope dates can arrive as a Date or a string. */
function toDate(value: Date | string | undefined | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function readStream(stream: NodeJS.ReadableStream, charset: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const buf = Buffer.concat(chunks);
  // A mojibake snippet is far better than a failed sync, so an unknown charset
  // falls back to utf8 with replacement characters rather than throwing.
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

export class ImapFlowMailReader implements MailReader {
  readonly name = "gmail-imap";
  private client: ImapFlow | null = null;

  constructor(private creds: GmailImapCredentials) {}

  private async connect(): Promise<ImapFlow> {
    if (this.client) return this.client;
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: this.creds.user, pass: this.creds.pass },
      logger: false,
      emitLogs: false,
    });
    await client.connect();
    this.client = client;
    return client;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        // Already gone — close() is required to be safe to call twice.
      }
    }
  }

  private identityOf(mailbox: { uidValidity: bigint; uidNext: number; exists: number }): MailboxIdentity {
    return {
      uidValidity: mailbox.uidValidity.toString(),
      uidNext: mailbox.uidNext,
      exists: mailbox.exists,
    };
  }

  async verify(): Promise<MailboxIdentity> {
    try {
      const client = await this.connect();
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
      return this.identityOf(mailbox);
    } finally {
      await this.close();
    }
  }

  async fetchWindow(w: FetchWindow): Promise<{ identity: MailboxIdentity; messages: FetchedMessage[] }> {
    try {
      const client = await this.connect();
      const mailbox = await client.mailboxOpen(w.mailbox, { readOnly: true });
      const identity = this.identityOf(mailbox);

      // The cursor is only usable if it was recorded under this same UIDVALIDITY.
      // If the mailbox was recreated, every stored UID is meaningless, so we fall
      // back to a full date scan and let Message-ID dedupe sort out the overlap.
      const cursorUsable =
        w.sinceUid > 0 &&
        w.expectedUidValidity !== null &&
        w.expectedUidValidity === identity.uidValidity;

      if (!cursorUsable && w.expectedUidValidity && w.expectedUidValidity !== identity.uidValidity) {
        logger.info(
          { from: w.expectedUidValidity, to: identity.uidValidity, mailbox: w.mailbox },
          "IMAP UIDVALIDITY changed — ignoring the stored cursor and re-scanning the window",
        );
      }

      const uids: number[] = cursorUsable
        ? (await client.search({ uid: `${w.sinceUid + 1}:*` }, { uid: true })) || []
        : (await client.search({ since: w.since }, { uid: true })) || [];

      // Newest first, then capped: a heavy backfill spreads over several ticks
      // instead of turning one connection into a ten-minute session.
      const selected = uids.sort((a, b) => b - a).slice(0, w.maxMessages);
      const messages: FetchedMessage[] = [];

      for (let i = 0; i < selected.length; i += FETCH_CHUNK) {
        const batch = selected.slice(i, i + FETCH_CHUNK);
        const fetched = await client.fetchAll(
          batch.join(","),
          { envelope: true, internalDate: true, bodyStructure: true, flags: true, size: true, threadId: true },
          { uid: true },
        );

        for (const m of fetched) {
          const envelope = m.envelope;
          const fromEntry = envelope?.from?.[0];
          const fromAddress = (fromEntry?.address || "").trim();
          const pick = pickTextPart(m.bodyStructure);

          let text = "";
          if (pick) {
            try {
              const dl = await client.download(String(m.uid), pick.part, {
                uid: true,
                // Native byte cap — 4 bytes per character covers worst-case UTF-8
                // and any transfer encoding overhead without buffering attachments.
                maxBytes: w.maxTextChars * 4,
              });
              if (dl.content) {
                const charset = dl.meta?.charset || "utf-8";
                text = toClassifiableText(await readStream(dl.content, charset), pick.isHtml, w.maxTextChars);
              }
            } catch (err) {
              // A message we cannot read the body of is still worth storing —
              // sender and subject alone classify most mail correctly.
              logger.warn({ uid: m.uid, err }, "could not download the body of an inbox message");
            }
          }

          messages.push({
            uid: m.uid,
            uidValidity: identity.uidValidity,
            mailbox: w.mailbox,
            messageId: envelope?.messageId ?? null,
            gmailThreadId: m.threadId ?? null,
            fromName: fromEntry?.name?.trim() || null,
            fromAddress: fromAddress || "unknown@unknown.invalid",
            fromDomain: domainOf(fromAddress),
            toAddress: envelope?.to?.[0]?.address ?? null,
            subject: envelope?.subject ?? "",
            receivedAt: toDate(m.internalDate) ?? toDate(envelope?.date) ?? new Date(),
            isUnread: !(m.flags?.has("\\Seen") ?? false),
            hasAttachments: hasAttachment(m.bodyStructure),
            sizeBytes: m.size ?? null,
            text,
          });
        }
      }

      return { identity, messages };
    } finally {
      await this.close();
    }
  }

  /**
   * Resolves the account's Trash by its \Trash special-use flag.
   * Never hardcode "[Gmail]/Trash" — localized accounts use "[Gmail]/Bin" and others.
   */
  private async resolveTrashPath(client: ImapFlow): Promise<string> {
    const boxes: ListResponse[] = await client.list();
    const bySpecialUse = boxes.find((b) => b.specialUse === "\\Trash");
    if (bySpecialUse) return bySpecialUse.path;
    const byFlag = boxes.find((b) => b.flags?.has("\\Trash"));
    if (byFlag) return byFlag.path;
    throw Object.assign(new Error("Could not find the Trash folder for this account"), {
      code: "NONEXISTENT",
    });
  }

  async moveToTrash(uids: number[], mailbox = "INBOX"): Promise<TrashResult> {
    if (uids.length === 0) return { movedUids: [], failedUids: [] };
    try {
      const client = await this.connect();
      const trashPath = await this.resolveTrashPath(client);

      // Opened read-write: this is the one and only write this feature performs.
      await client.mailboxOpen(mailbox);
      const res = await client.messageMove(uids.join(","), trashPath, { uid: true });

      if (!res) return { movedUids: [], failedUids: [...uids] };

      // With UIDPLUS the server tells us exactly which UIDs moved. Without it, a
      // truthy result means the whole move was accepted.
      if (res.uidMap && res.uidMap.size > 0) {
        const moved = uids.filter((u) => res.uidMap!.has(u));
        return { movedUids: moved, failedUids: uids.filter((u) => !res.uidMap!.has(u)) };
      }
      return { movedUids: [...uids], failedUids: [] };
    } finally {
      await this.close();
    }
  }
}
