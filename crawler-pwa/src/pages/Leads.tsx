import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  Search,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Send,
} from "lucide-react";
import { crawlerApi } from "../services/api.js";
import { Card, Button, Input, Spinner } from "../components/ui/primitives.js";
import { toast } from "../store/toast.js";
import type { EmailCategory } from "../types/index.js";

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "All", label: "All Categories" },
  { key: "HR", label: "HR" },
  { key: "Recruitment", label: "Recruitment" },
  { key: "Careers", label: "Careers" },
  { key: "IT", label: "IT & Tech" },
  { key: "Accounts", label: "Accounts" },
  { key: "Finance", label: "Finance" },
  { key: "Sales", label: "Sales & Marketing" },
  { key: "General", label: "General" },
];

const COMPANY_TYPES = [
  "All",
  "IT",
  "Finance",
  "Accounts",
  "Healthcare",
  "Education",
  "Marketing",
  "Consulting",
  "Other",
];

export default function Leads() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const jobIdParam = searchParams.get("jobId");

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedCompanyType, setSelectedCompanyType] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [importedFilter, setImportedFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);

  const jobId = jobIdParam ? parseInt(jobIdParam, 10) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: [
      "crawlerLeads",
      jobId,
      selectedCategory,
      selectedCompanyType,
      searchTerm,
      importedFilter,
      page,
    ],
    queryFn: () =>
      crawlerApi.listLeads({
        jobId,
        emailCategory: selectedCategory !== "All" ? selectedCategory : undefined,
        companyType: selectedCompanyType !== "All" ? selectedCompanyType : undefined,
        search: searchTerm || undefined,
        isImported: importedFilter === "imported" ? true : importedFilter === "unimported" ? false : undefined,
        page,
        limit: 20,
      }),
    refetchInterval: 4000,
  });

  const importMutation = useMutation({
    mutationFn: crawlerApi.importLeads,
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.imported} lead${res.imported !== 1 ? "s" : ""} to Mailnex Contacts!`
      );
      setSelectedLeadIds([]);
      qc.invalidateQueries({ queryKey: ["crawlerLeads"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to import leads to Mailnex");
    },
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!data?.rows) return;
    if (e.target.checked) {
      setSelectedLeadIds(data.rows.map((r) => r.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleToggleLead = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleImportSelected = () => {
    if (selectedLeadIds.length === 0) return;
    importMutation.mutate(selectedLeadIds);
  };

  const getCategoryColor = (cat: EmailCategory) => {
    switch (cat) {
      case "HR":
      case "Recruitment":
      case "Careers":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
      case "IT":
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
      case "Accounts":
      case "Finance":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
      case "Sales":
        return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
              <Users size={20} />
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E3FDFD]">
              Discovered Leads ({data?.total ?? 0})
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#334155] dark:text-gray-400">
            {jobId ? `Showing leads from Crawler Job #${jobId}` : "Review, filter, and selectively import leads into Mailnex Contacts."}
          </p>
        </div>

        {/* Action Button for Selected */}
        {selectedLeadIds.length > 0 && (
          <div className="flex items-center gap-2 animate-fadeIn">
            <span className="text-xs font-semibold text-[#0F172A] dark:text-gray-200">
              {selectedLeadIds.length} lead{selectedLeadIds.length > 1 ? "s" : ""} selected
            </span>
            <Button
              variant="success"
              onClick={handleImportSelected}
              disabled={importMutation.isPending}
              className="flex items-center gap-1.5 py-2 px-3 text-xs shadow-md cursor-pointer"
            >
              <Send size={14} /> Import to Mailnex
            </Button>
          </div>
        )}
      </div>

      <Card className="space-y-4">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                setSelectedCategory(cat.key);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer border ${
                selectedCategory === cat.key
                  ? "bg-[#60A5FA] text-white border-[#60A5FA] shadow-xs dark:bg-[#71C9CE] dark:text-gray-950 dark:border-[#71C9CE]"
                  : "bg-[#F1F5F9] text-[#334155] border-[#BAE6FD] hover:bg-[#E0F2FE] dark:bg-[#0e2124] dark:text-gray-300 dark:border-[#164549] dark:hover:bg-[#164549]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <div className="relative sm:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by company, email, location…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>

          <div>
            <select
              value={selectedCompanyType}
              onChange={(e) => {
                setSelectedCompanyType(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
            >
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>
                  Industry: {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={importedFilter}
              onChange={(e) => {
                setImportedFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
            >
              <option value="all">All Status</option>
              <option value="unimported">Ready to Import</option>
              <option value="imported">Already in Mailnex</option>
            </select>
          </div>
        </div>

        {/* Leads Table */}
        <div className="overflow-x-auto rounded-lg border border-[#BAE6FD] dark:border-[#164549]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#BAE6FD]/40 text-xs font-bold text-[#0F172A] dark:bg-[#164549]/60 dark:text-[#E3FDFD]">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={
                      data?.rows &&
                      data.rows.length > 0 &&
                      data.rows.every((r) => selectedLeadIds.includes(r.id))
                    }
                    className="rounded text-[#60A5FA] focus:ring-0"
                  />
                </th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Discovered Email</th>
                <th className="px-3 py-3">Classification</th>
                <th className="px-3 py-3">Source URL</th>
                <th className="px-3 py-3 text-right">Mailnex Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#BAE6FD]/40 dark:divide-[#164549]/40">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8">
                    <Spinner />
                  </td>
                </tr>
              ) : !data?.rows || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-gray-500">
                    No leads found matching your criteria.
                  </td>
                </tr>
              ) : (
                data.rows.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-[#E0F2FE]/40 dark:hover:bg-[#164549]/30 transition ${
                        isSelected ? "bg-blue-50/60 dark:bg-blue-950/30" : ""
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleLead(lead.id)}
                          className="rounded text-[#60A5FA] focus:ring-0"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#0F172A] dark:text-gray-100">
                          {lead.companyName || "Unknown"}
                        </div>
                        {lead.companyDomain && (
                          <div className="text-xs font-mono text-gray-500">{lead.companyDomain}</div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {lead.location || "India"}
                      </td>

                      <td className="px-3 py-3">
                        <span className="font-mono text-xs font-semibold text-[#0F172A] dark:text-gray-100">
                          {lead.email}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${getCategoryColor(
                              lead.emailCategory
                            )}`}
                          >
                            {lead.emailCategory}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {Math.round(lead.classificationConfidence * 100)}%
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {lead.sourceUrl ? (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Visit <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right">
                        {lead.isImported ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 size={11} /> In Mailnex
                          </span>
                        ) : (
                          <button
                            onClick={() => importMutation.mutate([lead.id])}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-[#BAE6FD] transition dark:border-[#164549] dark:bg-[#164549] dark:text-[#E3FDFD] dark:hover:bg-[#206368] cursor-pointer"
                          >
                            <UserPlus size={12} /> Import to Mailnex
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="py-1 px-2.5 text-xs flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="py-1 px-2.5 text-xs flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
