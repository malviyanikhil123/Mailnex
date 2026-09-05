import { apiClient } from "./client";
import type { CandidateProfile, PublicSettings, Resume } from "../types/api";

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
  listResumes: () =>
    apiClient.get<{ resumes: Resume[] }>("/settings/resumes").then((r) => r.data.resumes),
  uploadResumeFile: (file: File, name?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    return apiClient.post<Resume>("/settings/resumes", form).then((r) => r.data);
  },
  deleteResume: (id: number) =>
    apiClient.delete<{ deleted: boolean }>(`/settings/resumes/${id}`).then((r) => r.data),
};
