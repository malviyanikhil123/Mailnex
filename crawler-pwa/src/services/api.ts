import axios from "axios";
import { useAuth } from "../store/auth.js";
import type {
  DiscoveryJob,
  DiscoveredLead,
  DiscoveryStats,
  CreateDiscoveryJobInput,
  ListLeadsQuery,
  Paginated,
  ImportLeadsResponse,
  LoginResponse,
} from "../types/index.js";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      useAuth.getState().clear();
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password }).then((r) => r.data),
};

export const crawlerApi = {
  startJob: (input: CreateDiscoveryJobInput) =>
    apiClient.post<DiscoveryJob>("/lead-discovery/jobs", input).then((r) => r.data),

  listJobs: (limit = 20) =>
    apiClient.get<{ jobs: DiscoveryJob[] }>("/lead-discovery/jobs", { params: { limit } }).then((r) => r.data.jobs),

  getJob: (id: number) =>
    apiClient.get<DiscoveryJob>(`/lead-discovery/jobs/${id}`).then((r) => r.data),

  deleteJob: (id: number) =>
    apiClient.delete(`/lead-discovery/jobs/${id}`).then((r) => r.data),

  listLeads: (query: ListLeadsQuery) =>
    apiClient.get<Paginated<DiscoveredLead>>("/lead-discovery/leads", { params: query }).then((r) => r.data),

  getStats: () =>
    apiClient.get<DiscoveryStats>("/lead-discovery/stats").then((r) => r.data),

  importLeads: (leadIds: number[]) =>
    apiClient.post<ImportLeadsResponse>("/lead-discovery/leads/import", { leadIds }).then((r) => r.data),
};
