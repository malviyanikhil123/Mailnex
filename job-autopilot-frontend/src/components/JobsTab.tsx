import React, { useState, useEffect } from "react";
import { Search, Filter, ExternalLink, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { api } from "../services/api";
import { JobDetailModal } from "./JobDetailModal";
import type { JobItem } from "../types";

interface JobsTabProps {
  initialCountry?: string;
}

export const JobsTab: React.FC<JobsTabProps> = ({ initialCountry = "" }) => {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [poolTotal, setPoolTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters state
  const [q, setQ] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [remote, setRemote] = useState(false);
  const [days, setDays] = useState(45);
  const [sort, setSort] = useState("best");
  const [everything, setEverything] = useState(false);

  // Selected job for detail drawer
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);

  // Load countries on mount
  useEffect(() => {
    api.getCountries().then(setCountries).catch(() => {});
  }, []);

  // Update country if passed in from Overview
  useEffect(() => {
    if (initialCountry) {
      setCountry(initialCountry);
      setPage(1);
    }
  }, [initialCountry]);

  // Load jobs when filters or page changes
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchJobs();
    }, 200);
    return () => clearTimeout(handler);
  }, [q, country, remote, days, sort, everything, page]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await api.getJobs({
        page,
        limit: 50,
        q: q.trim() || undefined,
        country: country || undefined,
        remote,
        sort,
        everything,
        days: days > 0 ? days : undefined,
      });
      setJobs(res.jobs || []);
      setTotal(res.total || 0);
      setPoolTotal(res.pool || 0);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (iso?: string) => {
    if (!iso) return "—";
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  };

  const maxPage = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="frame p-4">
        <div className="filter-row">
          {/* Keyword Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-3 text-faint" />
            <input
              type="text"
              className="filter-input w-full pl-9"
              placeholder="Search title, tech, company..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Country Dropdown */}
          <select
            className="filter-select"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Days Limit */}
          <select
            className="filter-select"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="45">Last 45 days</option>
            <option value="0">Any time</option>
          </select>

          {/* Sort Order */}
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="best">Highest Fit Score First</option>
            <option value="newest">Newest First</option>
          </select>

          {/* Remote Toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-dim select-none px-2">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => {
                setRemote(e.target.checked);
                setPage(1);
              }}
              className="accent-aqua"
            />
            <span>Remote Only</span>
          </label>

          {/* Scope Toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-dim select-none px-2">
            <input
              type="checkbox"
              checked={everything}
              onChange={(e) => {
                setEverything(e.target.checked);
                setPage(1);
              }}
              className="accent-aqua"
            />
            <span>Everything in Pool</span>
          </label>
        </div>

        {/* Results Banner Status */}
        <div className="flex items-center justify-between pt-2 border-t border-line text-xs font-mono text-faint">
          <div className="flex items-center gap-2">
            <span className={`led ${everything ? "warn" : "ok"}`} />
            <span>
              {everything ? (
                <>
                  Showing all roles found —{" "}
                  <strong className="text-white num">{total.toLocaleString()}</strong> in pool
                  (including outside your target family).
                </>
              ) : (
                <>
                  Showing tailored matches only —{" "}
                  <strong className="text-aqua num">{total.toLocaleString()}</strong> of{" "}
                  <strong className="text-white num">{poolTotal.toLocaleString()}</strong> in pool.
                </>
              )}
            </span>
          </div>
          <div>
            Page <span className="text-white font-bold">{page}</span> of{" "}
            <span className="text-white font-bold">{maxPage}</span>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="frame">
        <div className="overflow-x-auto">
          <table className="cyber-table">
            <thead>
              <tr>
                <th className="w-16">Fit</th>
                <th>Role & Company</th>
                <th>Location</th>
                <th>Compensation</th>
                <th>Posted</th>
                <th>Source</th>
                <th className="w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-dim font-mono">
                    <span className="inline-block animate-spin mr-2">◷</span> Querying live database...
                  </td>
                </tr>
              ) : jobs.length > 0 ? (
                jobs.map((j) => {
                  const hasKnockouts = j.knockouts && j.knockouts.length > 0;
                  const tone = hasKnockouts
                    ? "out"
                    : (j.score || 0) >= 75
                    ? "good"
                    : (j.score || 0) >= 55
                    ? "mid"
                    : "low";

                  return (
                    <tr key={j.id}>
                      {/* Fit Score Badge */}
                      <td>
                        <button
                          className={`fit-badge ${j.score != null ? tone : "none"} cursor-pointer hover:brightness-125`}
                          onClick={() => setSelectedJob(j)}
                          title="Click to view AI reasoning and score breakdown"
                        >
                          <span className="score-val">
                            {hasKnockouts ? "OUT" : j.score != null ? j.score : "—"}
                          </span>
                          <span className="score-sub">
                            {hasKnockouts ? "Knocked" : j.verdict || "Unscored"}
                          </span>
                        </button>
                      </td>

                      {/* Title & Company */}
                      <td className="role-cell max-w-xs">
                        <button
                          className="text-left font-medium text-white hover:text-aqua bg-transparent border-0 p-0 cursor-pointer block truncate w-full"
                          onClick={() => setSelectedJob(j)}
                        >
                          {j.title}
                        </button>
                        <span className="company-sub truncate">{j.company_name}</span>
                      </td>

                      {/* Location & Remote */}
                      <td className="text-xs font-mono text-ink">
                        <span>{j.location || j.country?.toUpperCase() || "Worldwide"}</span>
                        {j.remote && <span className="tag rem ml-1.5">remote</span>}
                      </td>

                      {/* Salary */}
                      <td className="text-xs font-mono">
                        <span className={j.salary_text ? "text-aqua" : "text-faint"}>
                          {j.salary_text || "Not stated"}
                        </span>
                      </td>

                      {/* Posted Age */}
                      <td className="text-xs font-mono text-faint whitespace-nowrap">
                        {timeAgo(j.posted_at || j.first_seen_at)}
                        {!j.role_match && <span className="tag off ml-1.5">other</span>}
                      </td>

                      {/* Source */}
                      <td>
                        <span className="tag">{j.source_key}</span>
                      </td>

                      {/* External Posting Link */}
                      <td className="text-right">
                        <a
                          href={j.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-quiet text-xs py-1 px-2.5 inline-flex items-center gap-1"
                        >
                          <span>Open</span>
                          <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-dim font-mono text-sm">
                    No jobs match your current search filters. Try loosening the country, age, or toggle
                    "Everything in Pool".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Foot */}
        <div className="frame-head flex items-center justify-between">
          <div className="text-xs font-mono text-dim">
            Displaying {jobs.length} jobs on this page
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-quiet flex items-center gap-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-xs font-mono text-white px-2">
              {page} / {maxPage}
            </span>
            <button
              className="btn-quiet flex items-center gap-1"
              disabled={page >= maxPage}
              onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Job Detail Breakdown Modal */}
      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
};
