import { apiClient } from "./client";
import type {
  InboxCategory,
  InboxCategoryRule,
  InboxDeleteResult,
  InboxJobProgress,
  InboxMessage,
  InboxMessageDetail,
  InboxRuleField,
  InboxRuleMatch,
  InboxRuleTestResult,
  InboxStats,
  InboxSyncState,
  JobApplicationStatus,
} from "../types/api";

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
  trackSubStatus?: boolean;
  sortOrder?: number;
}

export interface RuleInput {
  field: InboxRuleField;
  matchType?: InboxRuleMatch;
  value: string;
  priority?: number;
  enabled?: boolean;
  subStatus?: JobApplicationStatus | null;
}

export interface ListMessagesParams {
  categoryId?: number | "uncategorized";
  state?: "ACTIVE" | "TRASHED";
  search?: string;
  source?: "NONE" | "RULE" | "AI" | "MANUAL";
  jobStatus?: JobApplicationStatus;
  unread?: boolean;
  page?: number;
  limit?: number;
}

export const inboxApi = {
  // ---- categories ----
  listCategories: () =>
    apiClient
      .get<{ categories: InboxCategory[]; uncategorized: { messageCount: number; unreadCount: number } }>(
        "/inbox/categories",
      )
      .then((r) => r.data),
  createCategory: (input: CategoryInput) =>
    apiClient.post<InboxCategory>("/inbox/categories", input).then((r) => r.data),
  updateCategory: (id: number, input: Partial<CategoryInput>) =>
    apiClient.put<InboxCategory>(`/inbox/categories/${id}`, input).then((r) => r.data),
  deleteCategory: (id: number, reassignTo?: number | null) =>
    apiClient
      .delete<{ deleted: boolean; reassigned: number }>(`/inbox/categories/${id}`, {
        params: reassignTo ? { reassignTo } : undefined,
      })
      .then((r) => r.data),
  seedDefaultCategories: () =>
    apiClient.post<{ created: number }>("/inbox/categories/seed-defaults").then((r) => r.data),
  reorderCategories: (order: number[]) =>
    apiClient.put<{ updated: number }>("/inbox/categories/order", { order }).then((r) => r.data),

  // ---- rules ----
  listRules: (categoryId: number) =>
    apiClient
      .get<{ rules: InboxCategoryRule[] }>(`/inbox/categories/${categoryId}/rules`)
      .then((r) => r.data.rules),
  createRule: (categoryId: number, input: RuleInput) =>
    apiClient
      .post<InboxCategoryRule>(`/inbox/categories/${categoryId}/rules`, input)
      .then((r) => r.data),
  updateRule: (ruleId: number, input: Partial<RuleInput>) =>
    apiClient.put<InboxCategoryRule>(`/inbox/rules/${ruleId}`, input).then((r) => r.data),
  deleteRule: (ruleId: number) =>
    apiClient.delete<{ deleted: boolean }>(`/inbox/rules/${ruleId}`).then((r) => r.data),
  testRule: (input: { field: InboxRuleField; matchType?: InboxRuleMatch; value: string }) =>
    apiClient.post<InboxRuleTestResult>("/inbox/rules/test", input).then((r) => r.data),

  // ---- messages ----
  listMessages: (params: ListMessagesParams = {}) =>
    apiClient
      .get<{ messages: InboxMessage[]; total: number; page: number; limit: number }>(
        "/inbox/messages",
        { params },
      )
      .then((r) => r.data),
  getMessage: (id: number) =>
    apiClient.get<InboxMessageDetail>(`/inbox/messages/${id}`).then((r) => r.data),
  setCategory: (id: number, categoryId: number | null, jobStatus?: JobApplicationStatus | null) =>
    apiClient
      .put<InboxMessage>(`/inbox/messages/${id}/category`, { categoryId, jobStatus: jobStatus ?? null })
      .then((r) => r.data),
  bulkSetCategory: (ids: number[], categoryId: number | null, jobStatus?: JobApplicationStatus | null) =>
    apiClient
      .post<{ updated: number }>("/inbox/messages/bulk-category", {
        ids,
        categoryId,
        jobStatus: jobStatus ?? null,
      })
      .then((r) => r.data),
  setRead: (id: number, isUnread: boolean) =>
    apiClient.post<{ updated: boolean }>(`/inbox/messages/${id}/read`, { isUnread }).then((r) => r.data),
  deleteMessages: (ids: number[]) =>
    apiClient.post<InboxDeleteResult>("/inbox/messages/delete", { ids }).then((r) => r.data),
  stats: () => apiClient.get<InboxStats>("/inbox/stats").then((r) => r.data),

  // ---- sync / classify ----
  startSync: () => apiClient.post<{ jobId: string }>("/inbox/sync").then((r) => r.data),
  startClassify: (mode: "new" | "all" = "new") =>
    apiClient.post<{ jobId: string }>("/inbox/classify", { mode }).then((r) => r.data),
  jobProgress: (jobId: string) =>
    apiClient.get<InboxJobProgress>(`/inbox/jobs/${jobId}/progress`).then((r) => r.data),
  syncState: () => apiClient.get<InboxSyncState>("/inbox/sync-state").then((r) => r.data),
  updateSyncState: (enabled: boolean) =>
    apiClient.put<{ enabled: boolean }>("/inbox/sync-state", { enabled }).then((r) => r.data),
  verify: () =>
    apiClient
      .post<{ ok: true; mailbox: { uidValidity: string; exists: number } }>("/inbox/verify")
      .then((r) => r.data),
};
