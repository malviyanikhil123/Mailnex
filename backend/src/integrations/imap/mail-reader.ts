/**
 * The inbound-mail port. Pure types, zero imports — every consumer (jobs, services,
 * tests) codes against this, so no imapflow type ever leaks out of this folder.
 *
 * Deliberately separate from integrations/email/provider.ts: that is a send port
 * with a pooled fire-and-forget transport, while an IMAP session is long-lived and
 * stateful with a selected mailbox and UID semantics. One interface covering both
 * would force read-side stubs into the existing send tests and make one of the two
 * lifecycles a lie.
 */

export interface FetchedMessage {
  uid: number;
  /** 32-bit unsigned, carried as a string so it stays lossless. */
  uidValidity: string;
  mailbox: string;
  messageId: string | null;
  gmailThreadId: string | null;
  fromName: string | null;
  fromAddress: string;
  fromDomain: string;
  toAddress: string | null;
  subject: string;
  receivedAt: Date;
  isUnread: boolean;
  hasAttachments: boolean;
  sizeBytes: number | null;
  /** Already HTML-flattened, quote-stripped, normalized and truncated. */
  text: string;
}

export interface FetchWindow {
  mailbox: string;
  /** Lower bound on INTERNALDATE, used only for a first/full scan. */
  since: Date;
  /** Incremental cursor. 0 means "no usable cursor — scan the whole window". */
  sinceUid: number;
  /**
   * The UIDVALIDITY the cursor was recorded under, or null if there is none.
   *
   * The reader compares this against the live mailbox after opening it and falls
   * back to a full date scan on a mismatch. The decision lives here because the
   * server's UIDVALIDITY is not knowable until the mailbox is open — a caller
   * cannot make it.
   */
  expectedUidValidity: string | null;
  maxMessages: number;
  maxTextChars: number;
}

export interface MailboxIdentity {
  uidValidity: string;
  uidNext: number;
  exists: number;
}

export interface TrashResult {
  movedUids: number[];
  failedUids: number[];
}

export interface MailReader {
  readonly name: string;
  /** Connect, open the mailbox read-only, return its identity. Used by /inbox/verify. */
  verify(): Promise<MailboxIdentity>;
  fetchWindow(w: FetchWindow): Promise<{ identity: MailboxIdentity; messages: FetchedMessage[] }>;
  /** The only write this feature ever performs against the mail account. */
  moveToTrash(uids: number[], mailbox?: string): Promise<TrashResult>;
  /** Idempotent — safe to call twice, and callers do. */
  close(): Promise<void>;
}
