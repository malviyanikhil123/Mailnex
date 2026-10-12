import { apiClient } from "./client";
import type { LoginResponse, User } from "../types/api";

export const authApi = {
  register: (name: string, email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/register", { name, email, password }).then((r) => r.data),
  login: (email: string, password: string, rememberMe = false) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password, rememberMe }).then((r) => r.data),
  me: () => apiClient.get<User>("/auth/me").then((r) => r.data),
  /** Revokes this browser's session (the one `refreshToken` belongs to) server-side; other
   *  devices stay signed in. Call before clearing the store. The short timeout keeps an
   *  unreachable server from holding up signing out. */
  logout: (refreshToken: string | null) =>
    apiClient.post("/auth/logout", refreshToken ? { refreshToken } : {}, { timeout: 5000 }).then((r) => r.data),
};
