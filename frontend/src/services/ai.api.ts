import { apiClient } from "./client";
import type { AiProviderId, AiProviderStatus } from "../types/api";

type ProvidersResponse = { providers: AiProviderStatus[] };

export const aiApi = {
  list: () => apiClient.get<ProvidersResponse>("/ai-providers").then((r) => r.data.providers),
  /** A new key is checked with the provider before it is stored, and never returned. */
  save: (provider: AiProviderId, input: { apiKey?: string; defaultModel?: string; makeDefault?: boolean }) =>
    apiClient.put<ProvidersResponse>(`/ai-providers/${provider}`, input).then((r) => r.data.providers),
  setDefault: (provider: AiProviderId) =>
    apiClient.post<ProvidersResponse>(`/ai-providers/${provider}/default`).then((r) => r.data.providers),
  remove: (provider: AiProviderId) =>
    apiClient.delete<ProvidersResponse>(`/ai-providers/${provider}`).then((r) => r.data.providers),
};
