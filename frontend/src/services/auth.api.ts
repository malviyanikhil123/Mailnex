import { apiClient } from "./client";
import type { LoginResponse, User } from "../types/api";

export const authApi = {
  register: (name: string, email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/register", { name, email, password }).then((r) => r.data),
  login: (email: string, password: string, rememberMe = false) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password, rememberMe }).then((r) => r.data),
  me: () => apiClient.get<User>("/auth/me").then((r) => r.data),
  /** Revokes the refresh token server-side. Call before clearing the store; it is short so
   *  an unreachable server can't hold up signing out. */
  logout: () => apiClient.post("/auth/logout", null, { timeout: 5000 }).then((r) => r.data),
};
