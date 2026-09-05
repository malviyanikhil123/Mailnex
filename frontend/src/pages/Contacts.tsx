import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../services/contacts.api";
import { Button, Card, Input, Spinner, ErrorState, StatusBadge } from "../components/ui/primitives";
import { toast } from "../store/toast";
import type { ContactStatus } from "../types/api";

const STATUSES: ContactStatus[] = ["PENDING", "PROCESSING", "SENT", "FAILED", "BOUNCED", "PAUSED"];

export default function Contacts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const limit = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contacts", search, status, page],
    queryFn: () => contactsApi.list({ search, status: status || undefined, page, limit }),
    refetchInterval: 4000,
  });

  const del = useMutation({
    mutationFn: (id: number) => contactsApi.remove(id),
    onSuccess: () => {
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to delete contact");
    },
  });

  const pollProgress = async (jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const p = await contactsApi.progress(jobId);
        setProgress(`Processing ${p.processed}/${p.total}…`);
        if (p.done) {
          clearInterval(timer);
          setProgress(null);
          if (p.summary) {
            if (p.summary.imported > 0) {
              toast.success(
                `Imported ${p.summary.imported} contact${p.summary.imported > 1 ? "s" : ""}! (${p.summary.duplicate} duplicates, ${p.summary.invalid} invalid)`,
              );
            } else {
              toast.error(
                `0 contacts imported (${p.summary.invalid} invalid rows, ${p.summary.duplicate} duplicates)`,
              );
            }
          } else {
            toast.success("Import complete");
          }
          qc.invalidateQueries({ queryKey: ["contacts"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["analytics"] });
        }
      } catch {
        clearInterval(timer);
        setProgress(null);
      }
    }, 1000);
  };

  const onFile = async (file: File) => {
    try {
      const { jobId } = await contactsApi.importFile(file);
      setProgress("Starting import…");
      pollProgress(jobId);
    } catch {
      toast.error("Import failed to start");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const header = "companyName,location,email,status\n";
    const body = data.rows
      .map((c) => `${c.companyName},${c.location ?? ""},${c.email},${c.status}`)
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-gray-500">Manage companies and recipients for your cold outreach campaigns.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="primary" className="text-xs sm:text-sm" onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <Button variant="secondary" className="text-xs sm:text-sm" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-lg bg-[#F1F5F9] border border-[#BAE6FD] px-4 py-2.5 text-sm font-medium text-[#0F172A] dark:bg-blue-950/60 dark:text-blue-300 dark:border-transparent">
          {progress}
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="Search company or email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message="Failed to load contacts." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[550px]">
                <thead className="text-left text-gray-700 text-xs uppercase bg-[#BAE6FD] dark:bg-gray-800/50">
                  <tr>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((c) => (
                    <tr key={c.id} className="border-t border-[#BAE6FD]/60 dark:border-gray-800 hover:bg-[#E0F2FE] dark:hover:bg-gray-800/30">
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">{c.companyName}</td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{c.location ?? "—"}</td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{c.email}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => confirm("Delete this contact?") && del.mutate(c.id)}
                          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data!.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No contacts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm border-t border-[#BAE6FD]/60 pt-3 dark:border-gray-800">
              <span className="text-gray-500 text-xs sm:text-sm">{data!.total} total contacts</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="text-xs py-1 px-2.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span className="text-xs sm:text-sm font-medium px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  className="text-xs py-1 px-2.5"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
