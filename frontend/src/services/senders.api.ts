import { apiClient } from "./client";
import type { SenderAccount } from "../types/api";

export const sendersApi = {
  list: () => apiClient.get<{ senders: SenderAccount[] }>("/senders").then((r) => r.data.senders),
  /** The app password is verified against Gmail before it is stored, and never returned. */
  create: (input: { label: string; email: string; appPassword: string; dailyLimit: number }) =>
    apiClient.post<SenderAccount>("/senders", input).then((r) => r.data),
  update: (id: number, input: Partial<{ label: string; appPassword: string; dailyLimit: number; active: boolean }>) =>
    apiClient.patch<SenderAccount>(`/senders/${id}`, input).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/senders/${id}`).then((r) => r.data),
};
