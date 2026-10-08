import { apiClient } from "./client";
import type { Campaign, CampaignInput } from "../types/api";

export const campaignApi = {
  list: () => apiClient.get<{ campaigns: Campaign[] }>("/campaigns").then((r) => r.data.campaigns),
  create: (input: CampaignInput) => apiClient.post<Campaign>("/campaigns", input).then((r) => r.data),
  update: (id: number, input: Partial<CampaignInput>) =>
    apiClient.patch<Campaign>(`/campaigns/${id}`, input).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/campaigns/${id}`).then((r) => r.data),
  start: (id: number) => apiClient.post<Campaign>(`/campaigns/${id}/start`).then((r) => r.data),
  pause: (id: number) => apiClient.post<Campaign>(`/campaigns/${id}/pause`).then((r) => r.data),
  resume: (id: number) => apiClient.post<Campaign>(`/campaigns/${id}/resume`).then((r) => r.data),
  stop: (id: number) => apiClient.post<Campaign>(`/campaigns/${id}/stop`).then((r) => r.data),
};
