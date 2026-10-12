import { apiClient } from "./client";
import type { Contact, ImportSummary, Paginated } from "../types/api";

export interface ListContactsParams {
  search?: string;
  status?: string;
  importId?: number;
  page?: number;
  limit?: number;
}

export interface ListImportsParams {
  /** Matches the import name or the file name. */
  search?: string;
  sort?: "newest" | "oldest";
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
  /** Set when the import failed (done is true, no summary). */
  error?: string;
}

export const contactsApi = {
  list: (params: ListContactsParams) =>
    apiClient.get<Paginated<Contact>>("/contacts", { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<Contact>(`/contacts/${id}`).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/contacts/${id}`).then((r) => r.data),
  /** Every import, oldest first (for import pickers). */
  imports: () =>
    apiClient.get<{ imports: ImportSummary[] }>("/contacts/imports").then((r) => r.data.imports),
  listImports: (params: ListImportsParams) =>
    apiClient
      .get<{ imports: ImportSummary[]; total: number }>("/contacts/imports", { params })
      .then((r) => r.data),
  importFile: (file: File, name?: string) => {
    const form = new FormData();
    // Fields before the file: the backend reads them from the multipart stream.
    if (name) form.append("name", name);
    form.append("file", file);
    return apiClient
      .post<{ jobId: string }>("/contacts/import", form)
      .then((r) => r.data);
  },
  progress: (jobId: string) =>
    apiClient.get<ImportProgress>(`/contacts/import/${jobId}/progress`).then((r) => r.data),
};
