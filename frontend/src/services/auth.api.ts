import { apiClient } from "./client";
import type { LoginResponse, User } from "../types/api";

export const authApi = {
  register: (name: string, email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/register", { name, email, password }).then((r) => r.data),
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password }).then((r) => r.data),
  me: () => apiClient.get<User>("/auth/me").then((r) => r.data),
  logout: () => apiClient.post("/auth/logout").then((r) => r.data),
};
