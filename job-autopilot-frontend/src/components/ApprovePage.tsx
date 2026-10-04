import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Ban, ExternalLink, FileText, Building2, MapPin } from "lucide-react";
import { api } from "../services/api";
import type { ApprovalItem } from "../types";

interface ApprovePageProps {
  token: string;
}

export const ApprovePage: React.FC<ApprovePageProps> = ({ token }) => {
  const [data, setData] = useState<ApprovalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionDone, setDecisionDone] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getApproval(token)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || "This approval link is invalid or has expired.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDecision = async (decision: "approved" | "rejected" | "never") => {
    setDeciding(true);
    try {
      const res = await api.decideApproval(token, decision);
      setDecisionDone(res.said || "Decision recorded successfully.");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeciding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-dim font-mono">
        <div className="animate-spin mr-2">◷</div> Loading approval record...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="frame p-8 max-w-md text-center space-y-4">
          <XCircle size={40} className="mx-auto text-bad" />
          <h2 className="text-xl font-bold text-white uppercase font-caps tracking-wider m-0">
            Link Unavailable
          </h2>
          <p className="text-sm text-dim">{error}</p>
        </div>
      </div>
    );
  }

  if (decisionDone) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="frame p-8 max-w-md text-center space-y-4">
          <CheckCircle2 size={40} className="mx-auto text-ok" />
          <h2 className="text-xl font-bold text-white uppercase font-caps tracking-wider m-0">
            Decision Saved
          </h2>
          <p className="text-sm text-ink">{decisionDone}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <div className="frame p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-aqua uppercase tracking-wider mb-1">
              <Building2 size={13} /> {data.companyName}
            </div>
            <h1 className="text-2xl font-bold text-white mb-1.5">{data.jobTitle}</h1>
            <div className="flex items-center gap-3 text-xs font-mono text-dim">
              {data.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {data.location}
                </span>
              )}
              {data.salaryText && <span className="text-aqua">{data.salaryText}</span>}
            </div>
          </div>

          <div className="fit-badge good text-base p-3">
            <span className="score-val text-2xl font-bold">{data.score ?? 85}</span>
            <span className="score-sub font-mono">Fit Score</span>
          </div>
        </div>

        {/* AI Analysis */}
        {data.summary && (
          <div className="py-4 border-b border-line text-sm text-ink leading-relaxed">
            <span className="font-caps tracking-wider text-xs text-dim uppercase block mb-1">
              Why We Matched This
            </span>
            {data.summary}
          </div>
        )}

        {/* Tailored Cover Letter / Pitch */}
        {data.coverLetter && (
          <div className="py-4 border-b border-line space-y-2">
            <span className="font-caps tracking-wider text-xs text-dim uppercase block">
              Tailored Outreach Draft
            </span>
            <div className="p-4 bg-field rounded border border-line text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed">
              {data.coverLetter}
            </div>
          </div>
        )}

        {/* Decision Actions */}
        <div className="pt-6 flex items-center justify-between flex-wrap gap-4">
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-quiet text-xs py-2 px-3 flex items-center gap-1.5"
            >
              <span>View Advert on Source</span>
              <ExternalLink size={13} />
            </a>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              className="btn-quiet text-xs text-bad hover:border-bad flex items-center gap-1 py-2 px-3.5"
              onClick={() => handleDecision("never")}
              disabled={deciding}
            >
              <Ban size={14} />
              <span>Block Company</span>
            </button>

            <button
              className="btn-quiet text-xs py-2 px-3.5 flex items-center gap-1"
              onClick={() => handleDecision("rejected")}
              disabled={deciding}
            >
              <XCircle size={14} />
              <span>Reject</span>
            </button>

            <button
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1"
              onClick={() => handleDecision("approved")}
              disabled={deciding}
            >
              <CheckCircle2 size={14} />
              <span>Approve Application</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
