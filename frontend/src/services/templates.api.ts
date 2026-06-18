import { apiClient } from "./client";
import type { Template } from "../types/api";

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  category?: string;
  active?: boolean;
}

export const templatesApi = {
  list: () => apiClient.get<Template[]>("/templates").then((r) => r.data),
  create: (input: TemplateInput) =>
    apiClient.post<Template>("/templates", input).then((r) => r.data),
  update: (id: number, input: Partial<TemplateInput>) =>
    apiClient.put<Template>(`/templates/${id}`, input).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/templates/${id}`).then((r) => r.data),
  preview: (id: number, vars: Record<string, string>) =>
    apiClient
      .post<{ subject: string; body: string }>(`/templates/${id}/preview`, vars)
      .then((r) => r.data),
};
