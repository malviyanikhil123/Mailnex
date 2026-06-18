import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { logsApi, type ListLogsParams } from "../services/logs.api";
import { Button, Card, Input, Spinner, ErrorState, StatusBadge } from "../components/ui/primitives";

const TABS: { key: ListLogsParams["status"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "bounced", label: "Bounced" },
];

export default function Logs() {
  const [tab, setTab] = useState<ListLogsParams["status"] | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["logs", tab, search, page],
    queryFn: () =>
      logsApi.list({ status: tab === "all" ? undefined : tab, search: search || undefined, page, limit }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Email Logs</h1>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "primary" : "secondary"}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </Button>
          ))}
          <div className="ml-auto w-64">
            <Input
              placeholder="Search subject / error…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message="Failed to load logs." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-2">Status</th>
                    <th>Company</th>
                    <th>Subject</th>
                    <th>AI</th>
                    <th>Retry</th>
                    <th>Error</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.logs.map((l) => (
                    <tr key={l.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                      <td className="py-2">
                        <StatusBadge status={l.status} />
                      </td>
                      <td>{l.companyName ?? "—"}</td>
                      <td className="max-w-xs truncate">{l.subject}</td>
                      <td>{l.aiUsed ? "✓" : "—"}</td>
                      <td>{l.retryCount}</td>
                      <td className="max-w-xs truncate text-red-600">{l.errorMessage ?? ""}</td>
                      <td>{new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data!.logs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500">
                        No logs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
