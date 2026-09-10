import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Compass,
  Building2,
  Globe,
  Mail,
  UserCheck,
  Code2,
  Receipt,
  CopyX,
  Play,
  ArrowRight,
  Sparkles,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { crawlerApi } from "../services/api.js";
import { Card, Button } from "../components/ui/primitives.js";
import type { DiscoveryMetricSet } from "../types/index.js";

type Timeframe = "today" | "yesterday" | "last7Days" | "last30Days";

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("today");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["crawlerStats"],
    queryFn: crawlerApi.getStats,
    refetchInterval: 6000,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["crawlerJobs"],
    queryFn: () => crawlerApi.listJobs(5),
    refetchInterval: 4000,
  });

  const currentMetrics: DiscoveryMetricSet = stats?.[timeframe] || {
    companiesFound: 0,
    pagesCrawled: 0,
    emailsFound: 0,
    hrEmailsFound: 0,
    itEmailsFound: 0,
    accountsEmailsFound: 0,
    otherEmailsFound: 0,
    duplicatesRemoved: 0,
  };

  const activeJob = jobs?.find((j) => j.status === "RUNNING" || j.status === "QUEUED");

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
              <Compass size={20} />
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Lead Discovery Overview
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#334155] dark:text-gray-400">
            Real-time monitoring of public company web crawlers and extracted HR/tech contact emails.
          </p>
        </div>

        {/* Timeframe Selector & CTA */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] p-1 dark:border-[#164549] dark:bg-[#0e2124]">
            {(
              [
                { key: "today", label: "Today" },
                { key: "yesterday", label: "Yesterday" },
                { key: "last7Days", label: "7D" },
                { key: "last30Days", label: "30D" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTimeframe(t.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  timeframe === t.key
                    ? "bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950"
                    : "text-[#334155] hover:bg-[#E0F2FE] dark:text-gray-400 dark:hover:bg-[#164549]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Link to="/discover">
            <Button className="flex items-center gap-1.5 text-xs py-2 px-3 shadow-sm">
              <Sparkles size={14} /> New Discovery
            </Button>
          </Link>
        </div>
      </div>

      {/* Active Job Alert Banner */}
      {activeJob && (
        <Card className="border-2 border-[#60A5FA] bg-gradient-to-r from-blue-50/80 to-[#E0F2FE]/50 dark:from-[#0b2428] dark:to-[#0e2124] dark:border-[#71C9CE] shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60A5FA] opacity-75 dark:bg-[#71C9CE]"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3B82F6] dark:bg-[#71C9CE]"></span>
                </span>
                <span className="font-bold text-[#0F172A] dark:text-[#E3FDFD] text-sm">
                  Active Crawler Job #{activeJob.id} ({activeJob.progress}%)
                </span>
                {activeJob.currentDomain && (
                  <span className="text-xs font-mono text-[#334155] dark:text-gray-300">
                    • Crawling {activeJob.currentDomain}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#334155] dark:text-gray-400">
                Found {activeJob.emailsFound} emails ({activeJob.hrEmailsFound} HR) across {activeJob.pagesCrawled} pages.
              </p>
            </div>

            <Link to="/jobs">
              <Button variant="secondary" className="text-xs flex items-center gap-1 py-1.5">
                <Activity size={14} /> View Live Progress <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>Companies</span>
            <Building2 size={16} className="text-[#60A5FA] dark:text-[#71C9CE]" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.companiesFound}
          </p>
          <span className="text-[10px] text-gray-500">Identified</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>Pages Crawled</span>
            <Globe size={16} className="text-blue-500 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.pagesCrawled}
          </p>
          <span className="text-[10px] text-gray-500">Public pages</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>Emails Found</span>
            <Mail size={16} className="text-indigo-500 dark:text-indigo-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.emailsFound}
          </p>
          <span className="text-[10px] text-gray-500">Total extracted</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <span>HR / Careers</span>
            <UserCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300">
            {statsLoading ? "…" : currentMetrics.hrEmailsFound}
          </p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Prime outreach</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>IT & Tech</span>
            <Code2 size={16} className="text-sky-500 dark:text-sky-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.itEmailsFound}
          </p>
          <span className="text-[10px] text-gray-500">Tech contacts</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>Accounts</span>
            <Receipt size={16} className="text-amber-500 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.accountsEmailsFound}
          </p>
          <span className="text-[10px] text-gray-500">Finance & Admin</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#334155] dark:text-gray-400">
            <span>Duplicates</span>
            <CopyX size={16} className="text-rose-500 dark:text-rose-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            {statsLoading ? "…" : currentMetrics.duplicatesRemoved}
          </p>
          <span className="text-[10px] text-gray-500">De-duplicated</span>
        </Card>
      </div>

      {/* Discovery Trends Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
            <div>
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
                Discovery Volume Trend
              </h2>
              <p className="text-xs text-[#334155] dark:text-gray-400">
                Daily extracted emails and identified HR contacts
              </p>
            </div>
            <span className="text-xs text-[#334155] dark:text-gray-400">Past 7 Days</span>
          </div>

          <div className="h-64 w-full pt-4">
            {stats?.dailyTrend && stats.dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#cbd5e1" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#cbd5e1" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      color: "#fff",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="emailsFound" name="Total Emails" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hrEmails" name="HR Emails" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#334155] dark:text-gray-400">
                No discovery history recorded yet.
              </div>
            )}
          </div>
        </Card>

        {/* Quick Launch & Recent Jobs */}
        <Card className="lg:col-span-4 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">Recent Crawl Runs</h2>
            <Link to="/jobs" className="text-xs font-semibold text-[#60A5FA] hover:underline dark:text-[#71C9CE]">
              View All
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {jobsLoading ? (
              <div className="flex justify-center p-4 text-xs text-gray-500">Loading…</div>
            ) : !jobs || jobs.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#334155] dark:text-gray-400">
                No crawl jobs launched yet.
              </div>
            ) : (
              jobs.slice(0, 4).map((job) => (
                <div
                  key={job.id}
                  className="p-2.5 rounded-lg border border-[#BAE6FD]/60 bg-white/50 dark:bg-[#12282c] dark:border-[#164549] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-[#0F172A] dark:text-gray-200 block">
                      {job.profession || "IT"} • {job.location || "India"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} • {job.emailsFound} emails ({job.hrEmailsFound} HR)
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      job.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : job.status === "RUNNING"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <Link to="/discover" className="block pt-2">
            <Button className="w-full flex items-center justify-center gap-1.5 py-2 text-xs">
              <Play size={14} /> Start New Crawl Job
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
