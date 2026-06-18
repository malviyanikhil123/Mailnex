import { apiClient } from "./client";
import type { DashboardStats, TrendPoint } from "../types/api";

export const analyticsApi = {
  dashboard: () => apiClient.get<DashboardStats>("/analytics/dashboard").then((r) => r.data),
  daily: (days = 14) =>
    apiClient.get<{ trends: TrendPoint[] }>("/analytics/daily", { params: { days } }).then((r) => r.data.trends),
  monthly: (months = 12) =>
    apiClient
      .get<{ trends: TrendPoint[] }>("/analytics/monthly", { params: { months } })
      .then((r) => r.data.trends),
};
