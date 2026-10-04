import type {
  Me,
  Profile,
  Settings,
  StatsResponse,
  JobItem,
  RunsResponse,
  AccountsResponse,
  ApprovalItem,
} from "../types";

// Dynamic API base: in development Vite proxies /api, or uses window.AUTOPILOT_API or VITE_API_URL
const API_BASE = (
  (typeof window !== "undefined" && ((window as any).AUTOPILOT_API || (import.meta as any).env?.VITE_API_URL)) ||
  ""
).replace(/\/$/, "");

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("content-type") && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return body as T;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ me: Me }> {
    return apiFetch<{ me: Me }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async signup(name: string, email: string, password: string): Promise<{ me: Me }> {
    return apiFetch<{ me: Me }>("/api/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  async logout(): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>("/api/logout", { method: "POST" });
  },

  async getMe(): Promise<{ me: Me; profile?: Profile; settings?: Settings }> {
    return apiFetch<{ me: Me; profile?: Profile; settings?: Settings }>("/api/me");
  },

  // Stats & Dashboard
  async getStats(): Promise<StatsResponse> {
    return apiFetch<StatsResponse>("/api/stats");
  },

  // Jobs
  async getJobs(params: {
    page?: number;
    limit?: number;
    q?: string;
    country?: string;
    remote?: boolean;
    sort?: string;
    everything?: boolean;
    days?: number;
  }): Promise<{ jobs: JobItem[]; total: number; pool: number; page: number; limit: number }> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.q) query.set("q", params.q);
    if (params.country) query.set("country", params.country);
    if (params.remote) query.set("remote", "1");
    if (params.sort) query.set("sort", params.sort);
    if (params.everything) query.set("everything", "1");
    if (params.days) query.set("days", String(params.days));

    return apiFetch<{ jobs: JobItem[]; total: number; pool: number; page: number; limit: number }>(
      `/api/jobs?${query.toString()}`
    );
  },

  async getCountries(): Promise<string[]> {
    return apiFetch<string[]>("/api/countries");
  },

  // Scheduler & Runs
  async getRuns(): Promise<RunsResponse> {
    return apiFetch<RunsResponse>("/api/runs");
  },

  // Accounts Needed
  async getAccounts(): Promise<AccountsResponse> {
    return apiFetch<AccountsResponse>("/api/accounts");
  },

  async scanAccounts(): Promise<{ found: any; accounts: AccountsResponse["accounts"] }> {
    return apiFetch<{ found: any; accounts: AccountsResponse["accounts"] }>("/api/accounts/scan", {
      method: "POST",
    });
  },

  async updateAccount(
    id: number,
    state: "approved" | "created" | "skipped"
  ): Promise<{ ok: boolean; accounts: AccountsResponse["accounts"] }> {
    return apiFetch<{ ok: boolean; accounts: AccountsResponse["accounts"] }>(`/api/accounts/${id}`, {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  },

  // Settings & Profile
  async saveSettings(settings: Partial<Settings>): Promise<{ settings: Settings }> {
    return apiFetch<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },

  async submitResumeText(resumeText: string): Promise<{ profile: Profile; settings: Settings }> {
    return apiFetch<{ profile: Profile; settings: Settings }>("/api/profile/from-resume", {
      method: "POST",
      body: JSON.stringify({ resumeText }),
    });
  },

  async uploadResumeFile(file: File): Promise<{ profile: Profile; settings: Settings }> {
    const res = await fetch(`${API_BASE}/api/profile/from-file`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": file.name,
      },
      body: file,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `File upload failed (${res.status})`);
    }
    return body;
  },

  // Approvals (single-use token)
  async getApproval(token: string): Promise<ApprovalItem> {
    return apiFetch<ApprovalItem>(`/approve/${token}`);
  },

  async decideApproval(
    token: string,
    decision: "approved" | "rejected" | "never"
  ): Promise<{ ok: boolean; said: string }> {
    return apiFetch<{ ok: boolean; said: string }>(`/approve/${token}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  },
};
