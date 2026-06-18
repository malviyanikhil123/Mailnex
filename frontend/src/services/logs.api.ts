import { apiClient } from "./client";
import type { EmailLogRow } from "../types/api";

export interface ListLogsParams {
  status?: "sent" | "failed" | "bounced";
  search?: string;
  page?: number;
  limit?: number;
}

export const logsApi = {
  list: (params: ListLogsParams) =>
    apiClient
      .get<{ logs: EmailLogRow[]; total: number; page: number; limit: number }>("/logs", { params })
      .then((r) => r.data),
};
