import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Trash2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { crawlerApi } from "../services/api.js";
import { Card, Button, Spinner } from "../components/ui/primitives.js";
import { toast } from "../store/toast.js";
import type { DiscoveryJob } from "../types/index.js";

export default function Jobs() {
  const qc = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<DiscoveryJob | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["crawlerJobsList"],
    queryFn: () => crawlerApi.listJobs(30),
    refetchInterval: 3000,
  });

  const deleteJobMutation = useMutation({
    mutationFn: crawlerApi.deleteJob,
    onSuccess: () => {
      toast.success("Job record removed");
      setSelectedJob(null);
      qc.invalidateQueries({ queryKey: ["crawlerJobsList"] });
      qc.invalidateQueries({ queryKey: ["crawlerStats"] });
    },
    onError: () => toast.error("Failed to delete job"),
  });

  const getStatusBadge = (status: DiscoveryJob["status"]) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 size={12} /> Completed
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse">
            <RefreshCw size={12} className="animate-spin" /> Running
          </span>
        );
      case "QUEUED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            <Clock size={12} /> Queued
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
            <AlertCircle size={12} /> Failed
          </span>
        );
      default:
        return <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
              <Activity size={20} />
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Crawler Jobs
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#334155] dark:text-gray-400">
            Monitor real-time crawling tasks, inspect crawl metrics, and view discovered contacts.
          </p>
        </div>

        <Link to="/discover">
          <Button className="text-xs py-2 px-3">Start New Job</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Jobs List (8 cols or 12 cols if no job selected) */}
        <Card className={`${selectedJob ? "lg:col-span-7" : "lg:col-span-12"} space-y-4`}>
          <div className="flex items-center justify-between border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Job Runs ({jobs?.length || 0})
            </h2>
            <span className="text-xs text-gray-500">Auto-refreshing every 3s</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#BAE6FD] dark:border-[#164549]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#BAE6FD]/40 text-xs font-bold text-[#0F172A] dark:bg-[#164549]/60 dark:text-[#E3FDFD]">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Target</th>
                  <th className="px-3 py-2.5">Goal</th>
                  <th className="px-3 py-2.5">Found</th>
                  <th className="px-3 py-2.5">HR Contacts</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#BAE6FD]/40 dark:divide-[#164549]/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8">
                      <Spinner />
                    </td>
                  </tr>
                ) : !jobs || jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-gray-500">
                      No crawler jobs found. Launch one from Discover!
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => {
                    const isSelected = selectedJob?.id === job.id;

                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`hover:bg-[#E0F2FE]/50 dark:hover:bg-[#164549]/40 transition cursor-pointer ${
                          isSelected ? "bg-blue-50/80 dark:bg-[#164549]/70" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-[#0F172A] dark:text-gray-200">
                          #{job.id}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className="font-semibold text-[#0F172A] dark:text-gray-100 block">
                            {job.profession || "IT"} • {job.location || "India"}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate max-w-[150px] block">
                            {job.keywords || "General"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                          {job.targetCount}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold text-[#0F172A] dark:text-gray-200">
                          {job.emailsFound}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {job.hrEmailsFound}
                        </td>
                        <td className="px-3 py-2.5">{getStatusBadge(job.status)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <ChevronRight size={15} className="inline text-gray-400" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Job Details Drawer (5 cols) */}
        {selectedJob && (
          <Card className="lg:col-span-5 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
              <div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
                  Job #{selectedJob.id} Details
                </h3>
                <span className="text-xs text-gray-500">
                  {new Date(selectedJob.createdAt).toLocaleString()}
                </span>
              </div>
              {getStatusBadge(selectedJob.status)}
            </div>

            {/* Live Progress Bar if Running */}
            {selectedJob.status === "RUNNING" && (
              <div className="space-y-2 p-3 rounded-lg bg-blue-50 dark:bg-[#12282c] border border-blue-200 dark:border-[#164549]">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-300">
                  <span>Crawling Progress</span>
                  <span>{selectedJob.progress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-[#71C9CE] h-full rounded-full transition-all duration-500"
                    style={{ width: `${selectedJob.progress}%` }}
                  />
                </div>
                {selectedJob.currentDomain && (
                  <div className="text-[11px] font-mono text-blue-800 dark:text-blue-300 flex items-center gap-1.5 pt-1">
                    <Globe size={12} className="animate-spin" />
                    Currently on: <span className="font-bold">{selectedJob.currentDomain}</span>
                  </div>
                )}
              </div>
            )}

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-[#BAE6FD]/60 bg-white/60 dark:bg-[#12282c] dark:border-[#164549]">
                <span className="text-gray-500 block">Companies Crawled:</span>
                <span className="text-base font-bold text-[#0F172A] dark:text-gray-100">{selectedJob.companiesFound}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-[#BAE6FD]/60 bg-white/60 dark:bg-[#12282c] dark:border-[#164549]">
                <span className="text-gray-500 block">Pages Crawled:</span>
                <span className="text-base font-bold text-[#0F172A] dark:text-gray-100">{selectedJob.pagesCrawled}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-[#BAE6FD]/60 bg-white/60 dark:bg-[#12282c] dark:border-[#164549]">
                <span className="text-gray-500 block">Total Emails Found:</span>
                <span className="text-base font-bold text-[#0F172A] dark:text-gray-100">{selectedJob.emailsFound}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-900">
                <span className="text-emerald-700 dark:text-emerald-400 block">HR / Careers Emails:</span>
                <span className="text-base font-bold text-emerald-800 dark:text-emerald-300">{selectedJob.hrEmailsFound}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-[#BAE6FD]/60 bg-white/60 dark:bg-[#12282c] dark:border-[#164549] col-span-2">
                <span className="text-gray-500 block">Duplicates Filtered:</span>
                <span className="text-base font-bold text-[#0F172A] dark:text-gray-100">{selectedJob.duplicatesRemoved}</span>
              </div>
            </div>

            {/* Criteria List */}
            <div className="p-3 rounded-lg border border-[#BAE6FD]/60 bg-white/40 dark:bg-[#12282c] dark:border-[#164549] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Location:</span>
                <span className="font-semibold">{selectedJob.location || "India"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Profession:</span>
                <span className="font-semibold">{selectedJob.profession || "IT"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Industry:</span>
                <span className="font-semibold">{selectedJob.companyType || "IT"}</span>
              </div>
              {selectedJob.keywords && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Keywords:</span>
                  <span className="font-semibold">{selectedJob.keywords}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Link to={`/leads?jobId=${selectedJob.id}`} className="flex-1">
                <Button className="w-full flex items-center justify-center gap-1.5 text-xs py-2">
                  <ExternalLink size={14} /> View Discovered Leads
                </Button>
              </Link>
              <Button
                variant="danger"
                onClick={() => deleteJobMutation.mutate(selectedJob.id)}
                className="py-2 px-3 text-xs"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
