import React from "react";
import { X, ExternalLink, AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";
import type { JobItem } from "../types";

interface JobDetailModalProps {
  job: JobItem | null;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
  if (!job) return null;

  const hasKnockouts = job.knockouts && job.knockouts.length > 0;
  const tone = hasKnockouts
    ? "out"
    : (job.score || 0) >= 75
    ? "good"
    : (job.score || 0) >= 55
    ? "mid"
    : "low";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="frame-head">
          <h2>Fit Breakdown & AI Score</h2>
          <button className="btn-quiet p-1 border-0 hover:text-white" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="frame-body space-y-6">
          {/* Header Role Summary */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-white mb-1 leading-snug">{job.title}</h1>
              <div className="text-sm font-medium text-dim flex items-center gap-2">
                <span>{job.company_name}</span>
                <span>·</span>
                <span>{job.location || job.country?.toUpperCase() || "Worldwide"}</span>
                {job.remote && <span className="tag rem">remote</span>}
              </div>
              {job.salary_text && (
                <div className="text-sm font-mono text-aqua mt-2">{job.salary_text}</div>
              )}
            </div>

            <div className={`fit-badge ${job.score != null ? tone : "none"} text-base p-3`}>
              <span className="score-val text-xl">
                {hasKnockouts ? "OUT" : job.score != null ? job.score : "—"}
              </span>
              <span className="score-sub font-mono">
                {hasKnockouts ? "Knocked" : job.verdict || "Unscored"}
              </span>
            </div>
          </div>

          {/* AI Reason Summary */}
          {job.summary && (
            <div className="p-3 bg-field-2 border border-line rounded text-sm text-ink leading-relaxed">
              <span className="font-caps tracking-wider text-xs text-aqua uppercase block mb-1">
                Reasoning Summary
              </span>
              {job.summary}
            </div>
          )}

          {/* Knockouts Warning */}
          {hasKnockouts && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded space-y-2">
              <div className="flex items-center gap-2 text-xs font-caps tracking-wider text-bad uppercase font-bold">
                <AlertTriangle size={14} /> Knockout Criteria Triggered
              </div>
              <ul className="text-xs text-red-200 list-disc list-inside space-y-1 font-mono">
                {job.knockouts!.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Score Parts Breakdown */}
          {job.parts && job.parts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-caps tracking-wider text-dim uppercase border-b border-line pb-1 m-0">
                Evaluation Factors
              </h3>
              <div className="space-y-2">
                {job.parts.map((part, i) => (
                  <div key={i} className="p-2.5 bg-field rounded border border-line/60 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white capitalize">{part.part}</span>
                      <span className="font-mono text-aqua font-bold">
                        {part.got} / {part.of} pts
                      </span>
                    </div>
                    <p className="text-faint m-0 leading-normal">{part.why}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions Bar */}
          <div className="pt-4 border-t border-line flex items-center justify-between">
            <span className="text-xs font-mono text-faint">
              Source: <span className="text-white">{job.source_key}</span>
            </span>
            <div className="flex items-center gap-2">
              <button className="btn-quiet" onClick={onClose}>
                Close
              </button>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                <span>Open Posting</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
