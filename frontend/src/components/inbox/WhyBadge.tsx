import type { InboxAssignmentSource } from "../../types/api";

/**
 * Says why an email ended up where it did.
 *
 * This is the whole feature's trust affordance: sorting the user cannot explain is
 * sorting the user will not rely on. Every badge is derived from what was actually
 * recorded at classification time, never guessed.
 */
export function WhyBadge({
  source,
  ruleLabel,
  confidence,
  reason,
  className = "",
}: {
  source: InboxAssignmentSource;
  ruleLabel?: string | null;
  confidence?: number | null;
  reason?: string | null;
  className?: string;
}) {
  const base =
    "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight";

  if (source === "MANUAL") {
    return (
      <span
        className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ${className}`}
        title="You chose this category. Re-sorting will never change it."
      >
        You moved this
      </span>
    );
  }

  if (source === "RULE") {
    return (
      <span
        className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 ${className}`}
        title={ruleLabel ? `Matched your rule: ${ruleLabel}` : "Matched one of your rules"}
      >
        <span className="truncate">{ruleLabel ? `Rule: ${ruleLabel}` : "Your rule"}</span>
      </span>
    );
  }

  if (source === "AI") {
    return (
      <span
        className={`${base} bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 ${className}`}
        title={reason ? `AI: ${reason}` : "Sorted by AI"}
      >
        AI{typeof confidence === "number" ? ` · ${confidence}%` : ""}
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${className}`}
      title={reason || "No rule matched and the AI had no confident answer."}
    >
      Unsorted
    </span>
  );
}

const JOB_STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  ACKNOWLEDGED: "Acknowledged",
  RECRUITER_REPLY: "Recruiter replied",
  INTERVIEW_INVITE: "Interview",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
  REJECTION: "Rejected",
  WITHDRAWN: "Withdrawn",
  OTHER: "Other",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  APPLIED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACKNOWLEDGED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  RECRUITER_REPLY: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  INTERVIEW_INVITE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  ASSESSMENT: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  OFFER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTION: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  WITHDRAWN: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export const JOB_STATUS_ORDER = [
  "APPLIED", "ACKNOWLEDGED", "RECRUITER_REPLY", "INTERVIEW_INVITE",
  "ASSESSMENT", "OFFER", "REJECTION", "WITHDRAWN", "OTHER",
] as const;

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

export function JobStatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        JOB_STATUS_COLORS[status] ?? JOB_STATUS_COLORS.OTHER
      }`}
    >
      {jobStatusLabel(status)}
    </span>
  );
}
