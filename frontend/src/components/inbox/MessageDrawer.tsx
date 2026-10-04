import { X, Trash2 } from "lucide-react";
import { Button, Spinner } from "../ui/primitives";
import { WhyBadge, JOB_STATUS_ORDER, jobStatusLabel } from "./WhyBadge";
import type { InboxCategory, InboxMessageDetail, JobApplicationStatus } from "../../types/api";

/** Plain-language account of how this message was sorted, and that it can be changed. */
function auditLine(m: InboxMessageDetail): string {
  const when = m.classifiedAt
    ? new Date(m.classifiedAt).toLocaleString(undefined, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  switch (m.assignmentSource) {
    case "MANUAL":
      return `You moved this here${when ? ` on ${when}` : ""}. Re-sorting will never change it.`;
    case "RULE":
      return `Sorted by your rule ${m.matchedRuleLabel ?? `#${m.matchedRuleId}`}${
        when ? ` on ${when}` : ""
      } — you can change this.`;
    case "AI":
      return `Sorted by AI${
        typeof m.aiConfidence === "number" ? ` with ${m.aiConfidence}% confidence` : ""
      }${m.aiReason ? `: ${m.aiReason}` : ""}${when ? ` (${when})` : ""} — you can change this.`;
    default:
      return "No rule matched and the AI had no confident answer, so this is unsorted.";
  }
}

export function MessageDrawer({
  message,
  loading,
  categories,
  onClose,
  onChangeCategory,
  onChangeJobStatus,
  onDelete,
}: {
  message: InboxMessageDetail | undefined;
  loading: boolean;
  categories: InboxCategory[];
  onClose: () => void;
  onChangeCategory: (categoryId: number | null) => void;
  onChangeJobStatus: (status: JobApplicationStatus | null) => void;
  onDelete: () => void;
}) {
  const category = message?.categoryId
    ? categories.find((c) => c.id === message.categoryId)
    : undefined;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-[#F1F5F9] shadow-2xl dark:bg-[#0e2124]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Email details"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[#BAE6FD] bg-[#F1F5F9] p-4 dark:border-[#164549] dark:bg-[#0e2124]">
          <h2 className="min-w-0 flex-1 text-base font-bold text-gray-900 dark:text-gray-100">
            {message?.subject || (loading ? "Loading…" : "(no subject)")}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-[#BAE6FD]/40 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </header>

        {loading || !message ? (
          <Spinner />
        ) : (
          <div className="space-y-4 p-4">
            <dl className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold">From</dt>
                <dd className="min-w-0 break-words">
                  {message.fromName ? `${message.fromName} · ` : ""}
                  {message.fromAddress}
                </dd>
              </div>
              {message.toAddress && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold">To</dt>
                  <dd className="min-w-0 break-words">{message.toAddress}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold">Received</dt>
                <dd>{new Date(message.receivedAt).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] p-3 dark:border-[#164549] dark:bg-[#091517]">
              <WhyBadge
                source={message.assignmentSource}
                ruleLabel={message.matchedRuleLabel}
                confidence={message.aiConfidence}
                reason={message.aiReason}
              />
              <p className="mt-2 text-xs text-gray-700 dark:text-gray-400">{auditLine(message)}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Category
                </span>
                <select
                  value={message.categoryId ?? ""}
                  onChange={(e) =>
                    onChangeCategory(e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Only rendered for a category that tracks application status. */}
              {category?.trackSubStatus && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Application stage
                  </span>
                  <select
                    value={message.jobStatus ?? ""}
                    onChange={(e) =>
                      onChangeJobStatus(
                        e.target.value === "" ? null : (e.target.value as JobApplicationStatus),
                      )
                    }
                    className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
                  >
                    <option value="">Not set</option>
                    {JOB_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {jobStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {(message.jobCompany || message.jobRole) && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {message.jobRole && <strong>{message.jobRole}</strong>}
                {message.jobRole && message.jobCompany && " at "}
                {message.jobCompany}
              </p>
            )}

            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Message</h3>
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[#BAE6FD] bg-white p-3 font-sans text-sm text-gray-800 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-200">
                {message.bodyText || "(no readable text in this email)"}
              </pre>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                Mailnex stores a shortened copy for sorting. Open Gmail for the full email.
              </p>
            </div>

            {message.state === "ACTIVE" && (
              <Button variant="danger" onClick={onDelete} className="flex items-center gap-1.5">
                <Trash2 size={14} />
                Move to Gmail Trash
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
