import { apiClient } from "./client";
import type { CandidateProfile, PublicSettings } from "../types/api";

export const settingsApi = {
  get: () => apiClient.get<PublicSettings>("/settings").then((r) => r.data),
  updateGmail: (email: string, appPassword: string) =>
    apiClient.patch("/settings/gmail", { email, appPassword }).then((r) => r.data),
  updateGemini: (apiKey: string) =>
    apiClient.patch("/settings/gemini", { apiKey }).then((r) => r.data),
  updateCandidate: (profile: CandidateProfile) =>
    apiClient.patch<CandidateProfile>("/settings/candidate", profile).then((r) => r.data),
  updateCampaign: (input: Record<string, unknown>) =>
    apiClient.patch("/settings/campaign", input).then((r) => r.data),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<{ resumeFileName: string }>("/settings/resume", form).then((r) => r.data);
  },
};
