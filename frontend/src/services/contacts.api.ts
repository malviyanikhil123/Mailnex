import { apiClient } from "./client";
import type { Contact, ImportSummary, Paginated } from "../types/api";

export interface ListContactsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ImportProgress {
  processed: number;
  total: number;
  done: boolean;
  summary?: {
    total: number;
    imported: number;
    skipped: number;
    duplicate: number;
    invalid: number;
    importedRows?: number;
    duplicateRows?: number;
    invalidRows?: number;
    totalRows?: number;
  };
}

export const contactsApi = {
  list: (params: ListContactsParams) =>
    apiClient.get<Paginated<Contact>>("/contacts", { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<Contact>(`/contacts/${id}`).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/contacts/${id}`).then((r) => r.data),
  imports: () =>
    apiClient.get<{ imports: ImportSummary[] }>("/contacts/imports").then((r) => r.data.imports),
  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post<{ jobId: string }>("/contacts/import", form)
      .then((r) => r.data);
  },
  progress: (jobId: string) =>
    apiClient.get<ImportProgress>(`/contacts/import/${jobId}/progress`).then((r) => r.data),
};
