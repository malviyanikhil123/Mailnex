import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../services/analytics.api";
import { Card, Spinner, ErrorState } from "../components/ui/primitives";
import { LineTrend, RatePie } from "../components/charts/Charts";

const TREND_RANGES = [14, 30] as const;
type TrendRange = (typeof TREND_RANGES)[number];

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </Card>
  );
}

function RangeToggle({ value, onChange }: { value: TrendRange; onChange: (v: TrendRange) => void }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-[#BAE6FD] p-0.5 dark:border-[#164549]">
      {TREND_RANGES.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === days
              ? "bg-[#BAE6FD] text-[#0F172A] dark:bg-[#164549] dark:text-[#E3FDFD]"
              : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          {days} days
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState<TrendRange>(14);
  const stats = useQuery({
    queryKey: ["dashboard"],
    queryFn: analyticsApi.dashboard,
    refetchInterval: 10000,
  });
  const daily = useQuery({
    queryKey: ["daily", days],
    queryFn: () => analyticsApi.daily(days),
    refetchInterval: 30000,
    placeholderData: keepPreviousData, // keep the chart up while switching range
  });
  const monthly = useQuery({ queryKey: ["monthly", 12], queryFn: () => analyticsApi.monthly(12) });

  if (stats.isLoading) return <Spinner />;
  if (stats.isError || !stats.data) return <ErrorState message="Failed to load dashboard." />;

  const d = stats.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Contacts" value={d.totalContacts} hint={`${d.totalImportedContacts} imported in total`} />
        <Stat label="Waiting to send" value={d.pending} />
        <Stat label="Sent today" value={d.emailsSentToday} />
        <Stat label="Avg emails / day" value={d.averageEmailsPerDay} />
        <Stat label="Emails generated" value={d.totalEmailsGenerated} hint={`${d.aiUsagePercent}% personalized with AI`} />
        <Stat label="Emails sent" value={d.totalEmailsSent} />
        <Stat label="Failed" value={d.totalFailed} />
        <Stat label="Bounced" value={d.totalBounced} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Daily email activity</div>
            <RangeToggle value={days} onChange={setDays} />
          </div>
          {daily.data ? <LineTrend data={daily.data} /> : <Spinner />}
        </Card>
        <Card>
          <div className="mb-2 font-semibold">Success / Failure</div>
          {d.totalEmailsSent + d.totalFailed + d.totalBounced > 0 && (
            <p className="text-xs text-gray-500">{d.successRate}% of send attempts succeeded</p>
          )}
          <RatePie success={d.successRate} failure={d.failureRate} />
        </Card>
      </div>

      <Card>
        <div className="mb-2 font-semibold">Monthly trend</div>
        {monthly.data ? <LineTrend data={monthly.data} /> : <Spinner />}
      </Card>

      <Card>
        <div className="mb-3 font-semibold">Recent imports</div>
        {d.importHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="text-left text-gray-700 text-xs uppercase bg-[#BAE6FD] dark:bg-gray-800/50">
                <tr>
                  <th className="py-2.5 px-3">File</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Imported</th>
                  <th className="py-2.5 px-3">Duplicate</th>
                  <th className="py-2.5 px-3">Invalid</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {d.importHistory.map((imp) => (
                  <tr key={imp.id} className="border-t border-[#BAE6FD]/60 dark:border-gray-800 text-xs sm:text-sm hover:bg-[#E0F2FE] dark:hover:bg-gray-800/30">
                    <td className="py-2.5 px-3 font-medium">{imp.fileName}</td>
                    <td className="py-2.5 px-3">{imp.totalRows}</td>
                    <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">{imp.importedRows}</td>
                    <td className="py-2.5 px-3 text-amber-600">{imp.duplicateRows}</td>
                    <td className="py-2.5 px-3 text-red-600">{imp.invalidRows}</td>
                    <td className="py-2.5 px-3 text-gray-500">{new Date(imp.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
