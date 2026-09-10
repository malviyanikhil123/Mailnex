import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Play,
  RefreshCw,
  Globe,
  MapPin,
  Briefcase,
  Layers,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { crawlerApi } from "../services/api.js";
import { Card, Button, Input } from "../components/ui/primitives.js";
import { toast } from "../store/toast.js";

const PROFESSIONS = [
  "IT / Software",
  "HR / Recruitment",
  "Accounts / Finance",
  "Marketing / Sales",
  "Healthcare",
  "Education",
  "All Professions",
];

const COMPANY_TYPES = [
  "IT",
  "Finance",
  "Accounts",
  "Healthcare",
  "Education",
  "Marketing",
  "Consulting",
  "Other",
  "All",
];

export default function Discover() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [location, setLocation] = useState("India");
  const [profession, setProfession] = useState("IT / Software");
  const [companyType, setCompanyType] = useState("IT");
  const [keywords, setKeywords] = useState("Software Developer, React, Node.js");
  const [targetCount, setTargetCount] = useState(50);

  const startJob = useMutation({
    mutationFn: crawlerApi.startJob,
    onSuccess: (newJob) => {
      toast.success(`Crawl job #${newJob.id} started successfully!`);
      qc.invalidateQueries({ queryKey: ["crawlerJobs"] });
      qc.invalidateQueries({ queryKey: ["crawlerStats"] });
      navigate("/jobs");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to start crawler job");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startJob.mutate({
      location,
      profession,
      companyType,
      keywords,
      targetCount,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
            <Sparkles size={20} />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
            Start Discovery Crawl
          </h1>
        </div>
        <p className="mt-1 text-sm text-[#334155] dark:text-gray-400">
          Configure search parameters to discover public company websites and extract classified recruiter/HR emails.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Main Form (8 cols) */}
        <Card className="md:col-span-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1.5">
                <MapPin size={14} className="text-[#60A5FA] dark:text-[#71C9CE]" /> Target Location
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. India, Bangalore, Pune, Remote"
                required
              />
              <span className="text-[11px] text-gray-500">
                Filters target companies by geographic presence or headquarters.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1.5">
                  <Briefcase size={14} className="text-[#60A5FA] dark:text-[#71C9CE]" /> Profession
                </label>
                <select
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
                >
                  {PROFESSIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1.5">
                  <Layers size={14} className="text-[#60A5FA] dark:text-[#71C9CE]" /> Company Type / Industry
                </label>
                <select
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                  className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
                >
                  {COMPANY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1.5">
                <Sliders size={14} className="text-[#60A5FA] dark:text-[#71C9CE]" /> Target Roles / Keywords
              </label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. React, Node.js, Frontend Developer, Backend"
              />
              <span className="text-[11px] text-gray-500">
                Helps prioritize companies with active engineering and recruitment pipelines.
              </span>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-gray-200 mb-1.5">
                <Globe size={14} className="text-[#60A5FA] dark:text-[#71C9CE]" /> Target Emails Goal
              </label>
              <Input
                type="number"
                min={10}
                max={500}
                step={10}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
              />
              <span className="text-[11px] text-gray-500">
                The crawler will stop once it extracts this number of valid email addresses.
              </span>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={startJob.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold shadow-md"
              >
                {startJob.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Starting Crawler Worker…
                  </>
                ) : (
                  <>
                    <Play size={16} /> Launch Discovery Crawler
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* Crawler Safety & Rules Panel (4 cols) */}
        <Card className="md:col-span-4 space-y-4 bg-gradient-to-br from-blue-50/50 to-white/40 dark:from-[#0b2428] dark:to-[#0e2124]">
          <div className="border-b border-[#BAE6FD] pb-3 dark:border-[#164549]">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Crawler Behavior & Safety
            </h2>
            <p className="text-[11px] text-gray-500">Autonomous polite crawling</p>
          </div>

          <div className="space-y-3 text-xs text-[#334155] dark:text-gray-300 leading-relaxed">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Prioritizes career pages (`/careers`, `/jobs`, `/contact`, `/team`).</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Classifies emails into HR, Recruitment, IT, Accounts, and General.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Enforces SSRF barriers (disallows localhost, private subnets).</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Automatic de-duplication against existing crawl records and Mailnex contacts.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Polite request throttling (200-300ms delays) and 5s timeout limits.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
