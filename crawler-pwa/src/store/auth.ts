import { create } from "zustand";
import type { User } from "../types/index.js";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("crawler_token") || localStorage.getItem("token"),
  refreshToken: localStorage.getItem("crawler_refreshToken") || localStorage.getItem("refreshToken"),
  user: (() => {
    try {
      const u = localStorage.getItem("crawler_user") || localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })(),
  setAuth: (token, refreshToken, user) => {
    localStorage.setItem("crawler_token", token);
    localStorage.setItem("crawler_refreshToken", refreshToken);
    localStorage.setItem("crawler_user", JSON.stringify(user));
    set({ token, refreshToken, user });
  },
  clear: () => {
    localStorage.removeItem("crawler_token");
    localStorage.removeItem("crawler_refreshToken");
    localStorage.removeItem("crawler_user");
    set({ token: null, refreshToken: null, user: null });
  },
}));
