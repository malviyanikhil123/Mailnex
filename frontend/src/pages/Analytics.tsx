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

export default function Analytics() {
  const stats = useQuery({ queryKey: ["dashboard"], queryFn: analyticsApi.dashboard });
  const daily = useQuery({ queryKey: ["daily", 30], queryFn: () => analyticsApi.daily(30) });
  const monthly = useQuery({ queryKey: ["monthly", 12], queryFn: () => analyticsApi.monthly(12) });

  if (stats.isLoading) return <Spinner />;
  if (stats.isError || !stats.data) return <ErrorState message="Failed to load analytics." />;
  const d = stats.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Stat label="Total Imported" value={d.totalImportedContacts} />
        <Stat label="Emails Generated" value={d.totalEmailsGenerated} />
        <Stat label="Emails Sent" value={d.totalEmailsSent} />
        <Stat label="Bounced" value={d.totalBounced} />
        <Stat label="Failed" value={d.totalFailed} />
        <Stat label="AI Usage %" value={`${d.aiUsagePercent}%`} />
        <Stat label="Avg Emails/Day" value={d.averageEmailsPerDay} />
        <Stat label="Success Rate" value={`${d.successRate}%`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 font-semibold">Daily Trend (30 days)</div>
          {daily.data ? <LineTrend data={daily.data} /> : <Spinner />}
        </Card>
        <Card>
          <div className="mb-2 font-semibold">Success / Failure</div>
          <RatePie success={d.successRate} failure={d.failureRate} />
        </Card>
      </div>

      <Card>
        <div className="mb-2 font-semibold">Monthly Trend</div>
        {monthly.data ? <LineTrend data={monthly.data} /> : <Spinner />}
      </Card>
    </div>
  );
}
