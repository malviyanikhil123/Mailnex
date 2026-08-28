import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "../store/auth";

const baseURL = window.__MAILNEX_CONFIG__.API_URL ?? "http://localhost:4000";

export const apiClient = axios.create({ baseURL });

// Attach the access token to every request.
apiClient.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuth.getState();
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefresh } = res.data as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(accessToken, newRefresh);
    return accessToken;
  } catch {
    clear();
    return null;
  }
}

// On a single 401, try to refresh once and retry the original request.
apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
