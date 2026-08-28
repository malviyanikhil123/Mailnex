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
      <div>
        <h1 className="text-2xl font-bold">Email Logs</h1>
        <p className="text-sm text-gray-500">Real-time audit log of all sent, generated, and bounced emails.</p>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? "primary" : "secondary"}
                className="text-xs sm:text-sm py-1.5 px-3"
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search subject or error…"
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
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[650px]">
                <thead className="text-left text-gray-500 text-xs uppercase bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Subject</th>
                    <th className="py-2.5 px-3">AI</th>
                    <th className="py-2.5 px-3">Retry</th>
                    <th className="py-2.5 px-3">Error</th>
                    <th className="py-2.5 px-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.logs.map((l) => (
                    <tr key={l.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 text-xs sm:text-sm">
                      <td className="py-2.5 px-3">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="py-2.5 px-3 font-medium">{l.companyName ?? "—"}</td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate text-gray-700 dark:text-gray-300">{l.subject}</td>
                      <td className="py-2.5 px-3 text-center">{l.aiUsed ? "✓" : "—"}</td>
                      <td className="py-2.5 px-3 text-center">{l.retryCount}</td>
                      <td className="py-2.5 px-3 max-w-[150px] truncate text-red-600 dark:text-red-400">{l.errorMessage ?? "—"}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data!.logs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500">
                        No logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm border-t border-gray-100 pt-3 dark:border-gray-800">
              <span className="text-gray-500 text-xs sm:text-sm">{data!.total} total logs</span>
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
