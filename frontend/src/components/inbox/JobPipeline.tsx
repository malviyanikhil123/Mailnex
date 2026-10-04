import { JOB_STATUS_ORDER, jobStatusLabel } from "./WhyBadge";
import type { InboxStats, JobApplicationStatus } from "../../types/api";

/** The stages worth showing as a funnel. Withdrawn/Other are noise in a strip. */
const PIPELINE_STAGES = JOB_STATUS_ORDER.filter(
  (s) => s !== "WITHDRAWN" && s !== "OTHER",
);

/**
 * Job application funnel.
 *
 * This is where "the most important category, tracked more extensively" becomes
 * something the user can actually see, rather than just a nullable column. Shown only
 * for a category that tracks application status.
 */
export function JobPipeline({
  stats,
  activeStatus,
  onSelectStatus,
}: {
  stats: InboxStats | undefined;
  activeStatus: JobApplicationStatus | null;
  onSelectStatus: (s: JobApplicationStatus | null) => void;
}) {
  const counts = new Map((stats?.byJobStatus ?? []).map((r) => [r.status, r.count]));
  const total = PIPELINE_STAGES.reduce((sum, s) => sum + (counts.get(s) ?? 0), 0);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-2 text-xs text-gray-600 dark:border-[#164549] dark:bg-[#091517] dark:text-gray-400">
        No application stages detected yet. Sort your mail, or set a stage on a message to start
        tracking it here.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeStatus && (
        <button
          onClick={() => onSelectStatus(null)}
          className="rounded-lg border border-[#BAE6FD] px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-[#BAE6FD]/40 dark:border-[#164549] dark:text-gray-400 dark:hover:bg-[#164549]/60"
        >
          Clear stage
        </button>
      )}
      {PIPELINE_STAGES.map((stage, i) => {
        const count = counts.get(stage) ?? 0;
        const active = activeStatus === stage;
        return (
          <div key={stage} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-300 dark:text-gray-700">›</span>}
            <button
              onClick={() => onSelectStatus(active ? null : (stage as JobApplicationStatus))}
              disabled={count === 0}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                active
                  ? "bg-[#60A5FA] text-white dark:bg-[#71C9CE] dark:text-gray-950"
                  : "bg-[#F1F5F9] text-gray-700 hover:bg-[#BAE6FD]/60 dark:bg-[#12282c] dark:text-gray-300 dark:hover:bg-[#164549]"
              }`}
            >
              {jobStatusLabel(stage)}
              <span className={active ? "opacity-80" : "text-gray-500 dark:text-gray-500"}>{count}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
