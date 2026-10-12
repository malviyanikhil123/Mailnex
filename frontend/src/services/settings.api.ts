import { apiClient } from "./client";
import type { DocumentList, ProfileField, PublicSettings, SenderProfile, UserDocument } from "../types/api";

export const settingsApi = {
  get: () => apiClient.get<PublicSettings>("/settings").then((r) => r.data),
  updateGmail: (email: string, appPassword: string) =>
    apiClient.patch("/settings/gmail", { email, appPassword }).then((r) => r.data),
  updateProfile: (profile: SenderProfile) =>
    apiClient.patch<SenderProfile>("/settings/profile", profile).then((r) => r.data),
  updateSending: (senderDailyLimit: number) =>
    apiClient.patch("/settings/sending", { senderDailyLimit }).then((r) => r.data),
  saveProfileFields: (fields: ProfileField[]) =>
    apiClient
      .put<{ fields: ProfileField[] }>("/settings/profile-fields", { fields })
      .then((r) => r.data.fields),
  listDocuments: () =>
    apiClient.get<DocumentList>("/settings/documents").then((r) => r.data),
  uploadDocument: (file: File, name?: string) => {
    const form = new FormData();
    // The name goes before the file so the server has it when the file part arrives.
    if (name) form.append("name", name);
    form.append("file", file);
    return apiClient.post<UserDocument>("/settings/documents", form).then((r) => r.data);
  },
  deleteDocument: (id: number) =>
    apiClient.delete<{ deleted: boolean }>(`/settings/documents/${id}`).then((r) => r.data),
};
