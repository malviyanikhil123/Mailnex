/**
 * syncInboxJob — pulls the last N days of INBOX into inbox_messages.
 *
 * A pure function over injected dependency ports, like send-email.ts, so it can be
 * tested without a database or a network. It NEVER throws: every failure is recorded
 * on the sync state row with a backoff, because an unattended cron job that throws
 * just disappears into the logs.
 *
 * Gmail is only ever read here. Nothing is moved, flagged or labelled.
 */

import { INBOX } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { classifyImapError } from "../integrations/imap/classify-imap-error.js";
import { toSnippet } from "../integrations/imap/truncate.js";
import type { MailReader } from "../integrations/imap/mail-reader.js";

export interface SyncStateRow {
  uidValidity: string | null;
  lastSeenUid: number;
  enabled: boolean;
  mailbox: string;
  nextAttemptAt: Date | null;
  consecutiveFailures: number;
  initialSyncDoneAt: Date | null;
}

export interface SyncMessageRow {
  mailbox: string;
  uidValidity: string;
  uid: number;
  messageId: string | null;
  gmailThreadId: string | null;
  fromName: string | null;
  fromAddress: string;
  fromDomain: string;
  toAddress: string | null;
  subject: string;
  snippet: string;
  bodyText: string;
  hasAttachments: boolean;
  sizeBytes: number | null;
  receivedAt: Date;
  isUnread: boolean;
}

export interface SyncInboxDeps {
  syncState: {
    get(): Promise<SyncStateRow | null>;
    upsert(patch: Record<string, unknown>): Promise<unknown>;
  };
  /** Throws a NOT_CONFIGURED-tagged error when no Gmail app password is saved. */
  getMailReader: () => Promise<MailReader>;
  messages: {
    existingMessageIds(since: Date): Promise<Set<string>>;
    insertMany(rows: SyncMessageRow[]): Promise<{ inserted: number }>;
  };
  progress?: (p: { phase: string; processed: number; total: number }) => void;
  now?: () => Date;
}

export interface SyncInboxResult {
  outcome: "ok" | "skipped" | "not_configured" | "error";
  fetched: number;
  inserted: number;
  duplicates: number;
  errorCode?: string;
  errorMessage?: string;
}

export async function syncInboxJob(
  deps: SyncInboxDeps,
  opts: { force?: boolean } = {},
): Promise<SyncInboxResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const empty = { fetched: 0, inserted: 0, duplicates: 0 };

  const state = await deps.syncState.get();

  if (state && !state.enabled) {
    return { outcome: "skipped", ...empty };
  }

  // The backoff gate is checked here as well as in SQL, so a direct caller cannot
  // hammer an account that Gmail is already unhappy with.
  if (!opts.force && state?.nextAttemptAt && state.nextAttemptAt > startedAt) {
    return { outcome: "skipped", ...empty };
  }

  const mailbox = state?.mailbox ?? "INBOX";
  // UTC arithmetic, deliberately not local-time date math: receivedAt is a
  // timestamp without timezone, so a local-time window would drift with the server.
  const since = new Date(startedAt.getTime() - INBOX.SYNC_WINDOW_DAYS * 86_400_000);

  let reader: MailReader | null = null;
  try {
    deps.progress?.({ phase: "connecting", processed: 0, total: 0 });
    reader = await deps.getMailReader();

    deps.progress?.({ phase: "fetching", processed: 0, total: 0 });
    const { identity, messages } = await reader.fetchWindow({
      mailbox,
      since,
      sinceUid: state?.lastSeenUid ?? 0,
      // The reader compares this against the live mailbox and re-scans the whole
      // window on a mismatch — it is the only place that knows the real value.
      expectedUidValidity: state?.uidValidity ?? null,
      maxMessages: INBOX.MAX_MESSAGES_PER_SYNC,
      maxTextChars: INBOX.MAX_TEXT_CHARS,
    });

    const usableCursor = state?.uidValidity === identity.uidValidity;

    deps.progress?.({ phase: "storing", processed: 0, total: messages.length });

    // Best-effort Message-ID dedupe on top of the UID unique index: it catches the
    // case where a re-scan sees the same mail under a new UID.
    const known = await deps.messages.existingMessageIds(since);
    const rows: SyncMessageRow[] = [];
    let duplicates = 0;

    for (const m of messages) {
      if (m.messageId && known.has(m.messageId)) {
        duplicates++;
        continue;
      }
      if (m.messageId) known.add(m.messageId);
      rows.push({
        mailbox: m.mailbox,
        uidValidity: m.uidValidity,
        uid: m.uid,
        messageId: m.messageId,
        gmailThreadId: m.gmailThreadId,
        fromName: m.fromName,
        fromAddress: m.fromAddress,
        fromDomain: m.fromDomain,
        toAddress: m.toAddress,
        subject: m.subject,
        snippet: toSnippet(m.text || m.subject, INBOX.SNIPPET_CHARS),
        bodyText: m.text,
        hasAttachments: m.hasAttachments,
        sizeBytes: m.sizeBytes,
        receivedAt: m.receivedAt,
        isUnread: m.isUnread,
      });
    }

    const { inserted } = await deps.messages.insertMany(rows);

    const maxUid = messages.reduce((acc, m) => Math.max(acc, m.uid), usableCursor ? state!.lastSeenUid : 0);
    const finishedAt = now();

    await deps.syncState.upsert({
      mailbox,
      uidValidity: identity.uidValidity,
      lastSeenUid: maxUid,
      lastSyncAt: finishedAt,
      lastSyncStatus: "SUCCESS",
      lastSyncError: null,
      lastSyncErrorCode: null,
      consecutiveFailures: 0,
      nextAttemptAt: null,
      messagesFetchedLast: messages.length,
      initialSyncDoneAt: state?.initialSyncDoneAt ?? finishedAt,
    });

    deps.progress?.({ phase: "done", processed: messages.length, total: messages.length });
    return { outcome: "ok", fetched: messages.length, inserted, duplicates };
  } catch (err) {
    const classified = classifyImapError(err);
    const failures = (state?.consecutiveFailures ?? 0) + 1;

    // Non-retryable problems (bad password, IMAP switched off) get a flat long
    // backoff rather than an escalating one — there is nothing to escalate toward,
    // and retrying an auth failure can get the account locked.
    const backoff = classified.retryable
      ? INBOX.BACKOFF_MS[Math.min(failures - 1, INBOX.BACKOFF_MS.length - 1)]!
      : INBOX.HARD_FAIL_BACKOFF_MS;

    await deps.syncState.upsert({
      mailbox,
      lastSyncAt: now(),
      lastSyncStatus: "ERROR",
      lastSyncError: classified.message,
      lastSyncErrorCode: classified.code,
      consecutiveFailures: failures,
      nextAttemptAt: new Date(now().getTime() + backoff),
    });

    logger.warn(
      { code: classified.code, retryable: classified.retryable, failures },
      "inbox sync failed",
    );

    deps.progress?.({ phase: "failed", processed: 0, total: 0 });
    return {
      outcome: classified.code === "NOT_CONFIGURED" ? "not_configured" : "error",
      ...empty,
      errorCode: classified.code,
      errorMessage: classified.message,
    };
  } finally {
    await reader?.close().catch(() => {});
  }
}
