import { RefreshCw, AlertTriangle, Settings2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/primitives";
import { relativeTime } from "./MessageRow";
import type { InboxJobProgress, InboxSyncState } from "../../types/api";

/** Per-code guidance, because "sync failed" is not something a user can act on. */
function errorAdvice(code: string | null): { text: string; fixInSettings: boolean } {
  switch (code) {
    case "NOT_CONFIGURED":
      return { text: "Add your Gmail app password to start reading your inbox.", fixInSettings: true };
    case "AUTH_FAILED":
      // The headline already carries the server's message, so this adds the action
      // rather than repeating it.
      return {
        text: "Re-enter it in Settings. Mailnex has stopped retrying — repeated attempts can lock the account.",
        fixInSettings: true,
      };
    case "IMAP_DISABLED":
      return {
        text: "IMAP is switched off for this Gmail account. Turn it on in Gmail's settings, then sync again.",
        fixInSettings: false,
      };
    case "NETWORK":
      return { text: "Couldn't reach Gmail. Mailnex will retry automatically.", fixInSettings: false };
    default:
      return { text: "Mailnex will retry automatically.", fixInSettings: false };
  }
}

export function SyncBanner({
  syncState,
  progress,
  isSyncing,
  isClassifying,
  onSync,
  onClassify,
  onVerify,
  verifying,
}: {
  syncState: InboxSyncState | undefined;
  progress: InboxJobProgress | null;
  isSyncing: boolean;
  isClassifying: boolean;
  onSync: () => void;
  onClassify: () => void;
  onVerify: () => void;
  verifying: boolean;
}) {
  if (!syncState) return null;

  if (!syncState.gmailConfigured) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
          Connect your Gmail to read your inbox
        </h3>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          Mailnex needs the same Gmail app password it uses to send. Nothing in your Gmail is
          moved or relabelled by sorting.
        </p>
        <Link to="/settings" className="mt-2.5 inline-block">
          <Button variant="secondary" className="flex items-center gap-1.5">
            <Settings2 size={14} />
            Open Settings
          </Button>
        </Link>
      </div>
    );
  }

  const failed = syncState.lastSyncStatus === "ERROR";
  const advice = failed ? errorAdvice(syncState.lastSyncErrorCode) : null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
        failed
          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : "border-[#BAE6FD] bg-[#E0F2FE] dark:border-[#164549] dark:bg-[#091517]"
      }`}
    >
      <div className="min-w-0 flex-1">
        {failed ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-900 dark:text-red-200">
              <AlertTriangle size={14} />
              {syncState.lastSyncError ?? "Inbox sync failed"}
            </p>
            <p className="mt-0.5 text-xs text-red-800 dark:text-red-300">
              {advice!.text}
              {advice!.fixInSettings && (
                <>
                  {" "}
                  <Link to="/settings" className="font-semibold underline">
                    Open Settings
                  </Link>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-700 dark:text-gray-400">
            {progress && !progress.done ? (
              <span className="font-medium">
                {progress.phase}
                {progress.total > 0 ? ` — ${progress.processed}/${progress.total}` : "…"}
              </span>
            ) : syncState.lastSyncAt ? (
              <>
                Synced {relativeTime(syncState.lastSyncAt)} ago · last {syncState.syncWindowDays} days
                of mail · checks every 10 minutes
              </>
            ) : (
              <>
                Not synced yet. Mailnex will pull the last {syncState.syncWindowDays} days of mail.
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onVerify} disabled={verifying}>
          {verifying ? "Testing…" : "Test connection"}
        </Button>
        <Button variant="secondary" onClick={onClassify} disabled={isClassifying} className="flex items-center gap-1.5">
          <Sparkles size={14} />
          {isClassifying ? "Sorting…" : "Sort unsorted"}
        </Button>
        <Button onClick={onSync} disabled={isSyncing} className="flex items-center gap-1.5">
          <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
    </div>
  );
}
