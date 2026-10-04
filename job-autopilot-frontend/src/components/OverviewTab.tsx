import React from "react";
import { Activity, Globe, MapPin, Radio, ShieldCheck, Zap } from "lucide-react";
import { GlobeView } from "./GlobeView";
import type { StatsResponse, Me } from "../types";

interface OverviewTabProps {
  stats: StatsResponse | null;
  user: Me;
  onSelectCountry: (country: string) => void;
  onGoToJobs: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  user,
  onSelectCountry,
  onGoToJobs,
}) => {
  if (!stats) {
    return (
      <div className="frame p-12 text-center text-dim font-mono">
        <div className="inline-block animate-spin mr-2">◷</div> Connecting to market radar...
      </div>
    );
  }

  const { totals, byCountry, daily, sources } = stats;
  const maxCountry = Math.max(1, ...byCountry.map((c) => c.n));
  const goodSources = sources.filter((s) => s.last_result === "ok");
  const badSources = sources.filter((s) => s.last_result && s.last_result !== "ok");

  // Dynamic greeting
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Personalized Intelligence Greeting */}
      <div className="frame p-4 bg-field-2/80 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-aqua/10 border border-aqua/30 flex items-center justify-center text-aqua">
            <Zap size={16} />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">
              {timeGreeting}, <span className="text-white font-semibold">{user.name}</span>.
              {totals.today > 0 ? (
                <>
                  {" "}The sweep detected{" "}
                  <strong className="text-aqua num">{totals.today.toLocaleString()} new roles</strong> in
                  your line of work today, out of{" "}
                  <strong className="text-white num">{totals.jobs.toLocaleString()}</strong> tailored so
                  far.
                </>
              ) : (
                <>
                  {" "}No new adverts in the last 24h.{" "}
                  <strong className="text-white num">{totals.jobs.toLocaleString()}</strong> matching
                  roles are on file.
                </>
              )}
            </div>
            <div className="text-xs font-mono text-faint mt-0.5">
              Targeting customized filters across {totals.countries} countries.
            </div>
          </div>
        </div>
        <button className="btn-primary text-xs py-1.5 px-3" onClick={onGoToJobs}>
          Browse My Jobs &rarr;
        </button>
      </div>

      {/* Metric Cards Readouts */}
      <div className="readouts-grid">
        <div className="readout-card">
          <span className="v text-aqua">{totals.jobs.toLocaleString()}</span>
          <span className="k">For You (Matched)</span>
        </div>
        <div className="readout-card">
          <span className="v">{totals.today.toLocaleString()}</span>
          <span className="k">New in Last 24h</span>
        </div>
        <div className="readout-card">
          <span className="v">{totals.pool.toLocaleString()}</span>
          <span className="k">Global Pool Collected</span>
        </div>
        <div className="readout-card">
          <span className="v">{totals.companies.toLocaleString()}</span>
          <span className="k">Active Companies</span>
        </div>
        <div className="readout-card">
          <span className="v">{totals.countries}</span>
          <span className="k">Target Countries</span>
        </div>
      </div>

      {/* Main Grid: 3D Globe + Country Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Globe Visualization */}
        <div className="lg:col-span-7 frame">
          <div className="frame-head">
            <h2>
              <Globe size={15} className="text-aqua" />
              Real-time Global Radar
            </h2>
            <span className="meta">Interactive 3D Mesh</span>
          </div>
          <div className="frame-body p-2">
            <GlobeView countries={byCountry} onSelectCountry={onSelectCountry} />
          </div>
        </div>

        {/* Top Country Signals */}
        <div className="lg:col-span-5 frame">
          <div className="frame-head">
            <h2>
              <MapPin size={15} className="text-steel" />
              Top Job Signals
            </h2>
            <span className="meta">top {byCountry.length} locations</span>
          </div>
          <div className="frame-body">
            <ul className="country-list">
              {byCountry.map((item, idx) => {
                const pct = ((item.n / maxCountry) * 100).toFixed(1);
                return (
                  <li key={item.country} className="country-item">
                    <span className="font-mono text-faint w-5 text-right">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <button
                      className="text-left flex-1 hover:text-aqua bg-transparent border-0 p-0 text-white font-mono cursor-pointer truncate"
                      onClick={() => onSelectCountry(item.country)}
                      title={`Filter jobs in ${item.country.toUpperCase()}`}
                    >
                      {item.country.toUpperCase()}
                    </button>
                    <div className="country-meter-bar w-24">
                      <div className="country-meter-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="num font-bold text-aqua w-10 text-right">
                      {item.n.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Fortnight Scan Trend & Watched Stations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Trace Chart */}
        <div className="lg:col-span-8 frame">
          <div className="frame-head">
            <h2>
              <Activity size={15} className="text-ok" />
              14-Day Discovery Cadence
            </h2>
            <span className="meta">Jobs indexed per day</span>
          </div>
          <div className="frame-body">
            {daily && daily.length > 0 ? (
              <div className="chart-container">
                {daily.map((d, i) => {
                  const maxDay = Math.max(1, ...daily.map((x) => x.n));
                  const hPct = Math.max(6, Math.round((d.n / maxDay) * 100));
                  return (
                    <div key={i} className="chart-bar-col" title={`${d.day}: ${d.n} jobs found`}>
                      <div className="chart-bar-pill" style={{ height: `${hPct}%` }} />
                      <div className="chart-bar-label">{d.day.split(" ")[0]}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-dim font-mono text-xs">
                No telemetry recorded for the past fortnight.
              </div>
            )}
          </div>
        </div>

        {/* Monitored Stations Health */}
        <div className="lg:col-span-4 frame">
          <div className="frame-head">
            <h2>
              <Radio size={15} className="text-warn" />
              Source Health
            </h2>
            <span className="meta">{sources.length} active monitors</span>
          </div>
          <div className="frame-body space-y-4">
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-line">
              <div className="p-3 bg-field rounded border border-line">
                <div className="text-2xl font-bold font-mono text-ok">{goodSources.length}</div>
                <div className="text-xs font-caps tracking-wider text-dim flex items-center gap-1.5 mt-1">
                  <span className="led ok" /> Operational
                </div>
              </div>
              <div className="p-3 bg-field rounded border border-line">
                <div className="text-2xl font-bold font-mono text-bad">{badSources.length}</div>
                <div className="text-xs font-caps tracking-wider text-dim flex items-center gap-1.5 mt-1">
                  <span className={`led ${badSources.length ? "bad" : "dim"}`} /> Offline/Error
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {sources.slice(0, 5).map((s) => (
                <div key={s.label} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className={`led ${s.last_result === "ok" ? "ok" : "bad"}`} />
                    <span className="text-white truncate">{s.label}</span>
                  </div>
                  <span className="text-aqua">+{s.added} kept</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
