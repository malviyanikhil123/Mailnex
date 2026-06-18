import { apiClient } from "./client";
import type { CampaignStatus, CampaignMode } from "../types/api";

export const campaignApi = {
  status: () => apiClient.get<CampaignStatus>("/campaign/status").then((r) => r.data),
  start: () => apiClient.post<CampaignStatus>("/campaign/start").then((r) => r.data),
  pause: () => apiClient.post<CampaignStatus>("/campaign/pause").then((r) => r.data),
  resume: () => apiClient.post<CampaignStatus>("/campaign/resume").then((r) => r.data),
  stop: () => apiClient.post<CampaignStatus>("/campaign/stop").then((r) => r.data),
  setMode: (mode: CampaignMode) =>
    apiClient.patch<CampaignStatus>("/campaign/mode", { mode }).then((r) => r.data),
};
