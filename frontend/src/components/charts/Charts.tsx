import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { TrendPoint } from "../../types/api";

const HEIGHT = 260;

/** Shown instead of an empty plot area, so a new account doesn't see blank boxes. */
export function NoChartData({ message = "No data yet" }: { message?: string }) {
  return (
    <div
      style={{ height: HEIGHT }}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#BAE6FD] text-center text-sm text-gray-500 dark:border-gray-700"
    >
      <span className="font-medium">{message}</span>
      <span className="mt-1 text-xs">This fills in once your campaigns start sending.</span>
    </div>
  );
}

export function hasTrendData(data: TrendPoint[]): boolean {
  return data.some((p) => p.sent > 0 || p.failed > 0);
}

export function LineTrend({ data }: { data: TrendPoint[] }) {
  if (!hasTrendData(data)) return <NoChartData />;
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#BAE6FD" strokeOpacity={0.8} />
        <XAxis dataKey="bucket" fontSize={11} />
        <YAxis allowDecimals={false} fontSize={11} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="sent" stroke="#60A5FA" name="Sent" strokeWidth={2.5} />
        <Line type="monotone" dataKey="failed" stroke="#dc2626" name="Failed/Bounced" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RatePie({ success, failure }: { success: number; failure: number }) {
  if (!(success > 0 || failure > 0)) return <NoChartData />;
  const data = [
    { name: "Success", value: success },
    { name: "Failure", value: failure },
  ];
  const colors = ["#10B981", "#dc2626"];
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={90} label>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
