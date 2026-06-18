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
  });

  const del = useMutation({
    mutationFn: (id: number) => contactsApi.remove(id),
    onSuccess: () => {
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const pollProgress = async (jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const p = await contactsApi.progress(jobId);
        setProgress(`Imported ${p.processed}/${p.total}`);
        if (p.done) {
          clearInterval(timer);
          setProgress(null);
          toast.success("Import complete");
          qc.invalidateQueries({ queryKey: ["contacts"] });
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import Excel
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">{progress}</div>
      )}

      <Card>
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Search company or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800"
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
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2">Company</th>
                  <th>Location</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2">{c.companyName}</td>
                    <td>{c.location ?? "—"}</td>
                    <td>{c.email}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => confirm("Delete this contact?") && del.mutate(c.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {data!.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      No contacts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-500">{data!.total} total</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
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
