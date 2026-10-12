import { apiClient } from "./client";
import type { GeneratedHtml, GenerateHtmlInput, Template, TemplateFormat, TemplatePreview } from "../types/api";

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  format?: TemplateFormat;
  category?: string;
  documentId?: number | null;
}

export const templatesApi = {
  list: () => apiClient.get<Template[]>("/templates").then((r) => r.data),
  create: (input: TemplateInput) =>
    apiClient.post<Template>("/templates", input).then((r) => r.data),
  update: (id: number, input: Partial<TemplateInput>) =>
    apiClient.put<Template>(`/templates/${id}`, input).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/templates/${id}`).then((r) => r.data),
  preview: (id: number, vars: Record<string, string>) =>
    apiClient.post<TemplatePreview>(`/templates/${id}/preview`, vars).then((r) => r.data),
  /** Adds the starter templates the user doesn't have yet; safe to call again. */
  addStarter: () => apiClient.post<{ added: number }>("/templates/starter").then((r) => r.data),
  /** AI-designed HTML for the editor; not saved. */
  generateHtml: (input: GenerateHtmlInput) =>
    apiClient.post<GeneratedHtml>("/templates/generate-html", input).then((r) => r.data),
};
