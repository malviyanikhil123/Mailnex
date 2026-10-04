import { Paperclip, AlertTriangle } from "lucide-react";
import { WhyBadge, JobStatusChip } from "./WhyBadge";
import type { InboxCategory, InboxMessage } from "../../types/api";

/** Short relative time — exact timestamps live in the message drawer. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function MessageRow({
  message,
  categories,
  selected,
  onToggleSelect,
  onOpen,
  onChangeCategory,
}: {
  message: InboxMessage;
  categories: InboxCategory[];
  selected: boolean;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onOpen: (id: number) => void;
  onChangeCategory: (id: number, categoryId: number | null) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 border-b border-[#BAE6FD] px-3 py-2.5 transition last:border-b-0 dark:border-[#164549] ${
        selected ? "bg-[#BAE6FD]/40 dark:bg-[#164549]/50" : "hover:bg-[#BAE6FD]/20 dark:hover:bg-[#164549]/30"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggleSelect(message.id, (e.nativeEvent as MouseEvent).shiftKey)}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-400 accent-[#60A5FA] dark:accent-[#71C9CE]"
        aria-label={`Select email from ${message.fromName || message.fromAddress}`}
      />

      <button onClick={() => onOpen(message.id)} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${
              message.isUnread
                ? "font-bold text-gray-900 dark:text-gray-100"
                : "font-medium text-gray-700 dark:text-gray-300"
            }`}
          >
            {message.fromName || message.fromAddress}
          </span>
          <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-500">
            {relativeTime(message.receivedAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {message.hasAttachments && (
            <Paperclip size={12} className="shrink-0 text-gray-400" aria-label="Has an attachment" />
          )}
          <span
            className={`truncate text-sm ${
              message.isUnread ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"
            }`}
          >
            {message.subject || "(no subject)"}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-500">{message.snippet}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <WhyBadge
            source={message.assignmentSource}
            ruleLabel={message.matchedRuleLabel}
            confidence={message.aiConfidence}
            reason={message.aiReason}
          />
          {message.jobStatus && <JobStatusChip status={message.jobStatus} />}
          {message.deleteError && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
              title={message.deleteError}
            >
              <AlertTriangle size={11} />
              Couldn&apos;t move to Trash
            </span>
          )}
        </div>
      </button>

      {/* The category chip IS the picker — one click to correct, no dialog. */}
      <select
        value={message.categoryId ?? ""}
        onChange={(e) => onChangeCategory(message.id, e.target.value === "" ? null : Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        aria-label="Change category"
        className="mt-0.5 hidden shrink-0 rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-2 py-1 text-xs outline-none focus:border-[#60A5FA] sm:block dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200"
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
