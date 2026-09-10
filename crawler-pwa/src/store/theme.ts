import { create } from "zustand";

interface ThemeState {
  dark: boolean;
  toggle: () => void;
  apply: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  dark: localStorage.getItem("crawler_dark") === "true",
  toggle: () => {
    const next = !get().dark;
    localStorage.setItem("crawler_dark", String(next));
    set({ dark: next });
    get().apply();
  },
  apply: () => {
    const isDark = get().dark;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  },
}));
