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

export function LineTrend({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="bucket" fontSize={11} />
        <YAxis allowDecimals={false} fontSize={11} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="sent" stroke="#16a34a" name="Sent" strokeWidth={2} />
        <Line type="monotone" dataKey="failed" stroke="#dc2626" name="Failed/Bounced" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RatePie({ success, failure }: { success: number; failure: number }) {
  const data = [
    { name: "Success", value: success },
    { name: "Failure", value: failure },
  ];
  const colors = ["#16a34a", "#dc2626"];
  return (
    <ResponsiveContainer width="100%" height={260}>
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
