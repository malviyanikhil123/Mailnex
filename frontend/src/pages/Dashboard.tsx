import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../services/analytics.api";
import { Card, Spinner, ErrorState } from "../components/ui/primitives";
import { LineTrend, RatePie } from "../components/charts/Charts";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

export default function Dashboard() {
  const stats = useQuery({ queryKey: ["dashboard"], queryFn: analyticsApi.dashboard });
  const daily = useQuery({ queryKey: ["daily", 14], queryFn: () => analyticsApi.daily(14) });

  if (stats.isLoading) return <Spinner />;
  if (stats.isError || !stats.data) return <ErrorState message="Failed to load dashboard." />;

  const d = stats.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Contacts" value={d.totalContacts} />
        <Stat label="Pending" value={d.pending} />
        <Stat label="Sent" value={d.sent} />
        <Stat label="Failed" value={d.failed} />
        <Stat label="Bounced" value={d.bounced} />
        <Stat label="Sent Today" value={d.emailsSentToday} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 font-semibold">Daily Email Activity</div>
          {daily.data ? <LineTrend data={daily.data} /> : <Spinner />}
        </Card>
        <Card>
          <div className="mb-2 font-semibold">Success / Failure</div>
          <RatePie success={d.successRate} failure={d.failureRate} />
        </Card>
      </div>

      <Card>
        <div className="mb-3 font-semibold">Recent Imports</div>
        {d.importHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">File</th>
                <th>Total</th>
                <th>Imported</th>
                <th>Duplicate</th>
                <th>Invalid</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {d.importHistory.map((imp) => (
                <tr key={imp.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1">{imp.fileName}</td>
                  <td>{imp.totalRows}</td>
                  <td>{imp.importedRows}</td>
                  <td>{imp.duplicateRows}</td>
                  <td>{imp.invalidRows}</td>
                  <td>{new Date(imp.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
