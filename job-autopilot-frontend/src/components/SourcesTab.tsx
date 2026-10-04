import React, { useState, useEffect } from "react";
import { Radio, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api } from "../services/api";
import type { RunsResponse, StatsResponse } from "../types";

export const SourcesTab: React.FC = () => {
  const [runsData, setRunsData] = useState<RunsResponse | null>(null);
  const [sources, setSources] = useState<StatsResponse["sources"]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [runsRes, statsRes] = await Promise.all([api.getRuns(), api.getStats()]);
      setRunsData(runsRes);
      setSources(statsRes.sources || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const timeAgo = (iso?: string | null) => {
    if (!iso) return "—";
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  };

  const runs = runsData?.runs || [];
  const due = runsData?.due || {};
  const worked = runs.filter((r) => r.ok).length;
  const failed = runs.filter((r) => r.finished_at && !r.ok).length;
  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      {/* Top Cadence Status Frame */}
      <div className="frame">
        <div className="frame-head">
          <h2>
            <Clock size={15} className="text-aqua" />
            Automatic Hunt Scheduler
          </h2>
          <button className="btn-quiet flex items-center gap-1.5" onClick={loadData} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
        <div className="frame-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-field rounded border border-line">
              <span className="text-xs font-caps tracking-wider text-dim uppercase block mb-1">
                Scheduler Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`led ${due.running ? "warn live" : due.next ? "ok" : "dim"}`} />
                <span className="text-base font-semibold text-white font-mono">
                  {due.running
                    ? "Sweep in Progress"
                    : due.next
                    ? "Armed & Scheduled"
                    : "Unscheduled"}
                </span>
              </div>
              <p className="text-xs font-mono text-faint mt-2">
                Cadence: sweeps every {runsData?.everyMinutes || 60} minutes after last completion.
              </p>
            </div>

            <div className="p-4 bg-field rounded border border-line">
              <span className="text-xs font-caps tracking-wider text-dim uppercase block mb-1">
                Last Scheduled Run
              </span>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                {lastRun ? timeAgo(lastRun.started_at) : "Never"}
              </div>
              <div className="text-xs font-mono text-faint mt-1 flex items-center gap-1.5">
                <span
                  className={`led ${
                    !lastRun ? "dim" : lastRun.ok ? "ok" : lastRun.finished_at ? "bad" : "warn live"
                  }`}
                />
                <span>
                  {lastRun
                    ? lastRun.ok
                      ? "Completed cleanly"
                      : lastRun.finished_at
                      ? "Terminated with error"
                      : "Running now"
                    : "No recorded history"}
                </span>
              </div>
            </div>

            <div className="p-4 bg-field rounded border border-line">
              <span className="text-xs font-caps tracking-wider text-dim uppercase block mb-1">
                Reliability Metrics
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-ok">{worked}</span>
                <span className="text-sm font-mono text-dim">succeeded</span>
                {failed > 0 && (
                  <>
                    <span className="text-2xl font-bold font-mono text-bad ml-2">{failed}</span>
                    <span className="text-sm font-mono text-dim">failed</span>
                  </>
                )}
              </div>
              <p className="text-xs font-mono text-faint mt-2">
                Across {runs.length} recorded autonomous tasks.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Watched Job Sources Table */}
      <div className="frame">
        <div className="frame-head">
          <h2>
            <Radio size={15} className="text-steel" />
            Configured Crawlers & Ingestion Feeds
          </h2>
          <span className="meta">{sources.length} sources registered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="cyber-table">
            <thead>
              <tr>
                <th>Source Label</th>
                <th>Channel Type</th>
                <th>Discovered</th>
                <th>New Added</th>
                <th>Status</th>
                <th className="text-right">Last Swept</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, idx) => (
                <tr key={idx}>
                  <td className="font-semibold text-white">{s.label}</td>
                  <td>
                    <span className="tag capitalize">{s.kind}</span>
                  </td>
                  <td className="num text-ink">{s.found.toLocaleString()}</td>
                  <td className="num font-bold text-aqua">+{s.added.toLocaleString()}</td>
                  <td>
                    <span className="flex items-center gap-1.5 text-xs font-mono">
                      <span className={`led ${s.last_result === "ok" ? "ok" : "bad"}`} />
                      <span className={s.last_result === "ok" ? "text-ok" : "text-bad"}>
                        {s.last_result === "ok" ? "Operational" : s.last_result || "Offline"}
                      </span>
                    </span>
                  </td>
                  <td className="text-right text-xs font-mono text-faint">
                    {timeAgo(s.last_run_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduler Execution Log */}
      <div className="frame">
        <div className="frame-head">
          <h2>Execution Log</h2>
          <span className="meta">Last 20 automated passes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="cyber-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Task Type</th>
                <th>Status</th>
                <th>Seen</th>
                <th>Kept</th>
                <th>Diagnostics</th>
              </tr>
            </thead>
            <tbody>
              {runs.length > 0 ? (
                runs.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs font-mono text-faint">{timeAgo(r.started_at)}</td>
                    <td className="capitalize font-mono text-white font-medium">{r.kind}</td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-mono">
                        <span
                          className={`led ${
                            r.ok ? "ok" : r.finished_at ? "bad" : "warn live"
                          }`}
                        />
                        <span>{r.ok ? "Worked" : r.finished_at ? "Failed" : "Running"}</span>
                      </span>
                    </td>
                    <td className="num text-ink">{r.found.toLocaleString()}</td>
                    <td className="num text-aqua font-bold">+{r.added.toLocaleString()}</td>
                    <td className="text-xs font-mono text-faint">{r.note || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-dim font-mono text-xs">
                    No run logs detected. To run an autonomous sweep on demand, run{" "}
                    <code className="text-aqua">npm run hunt</code> in the backend.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
