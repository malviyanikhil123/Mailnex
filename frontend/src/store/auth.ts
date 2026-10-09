import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { User } from "../types/api";

export const AUTH_STORAGE_KEY = "mailnex-auth";
/** Key used before the rename; moved over once so signed-in users stay signed in. */
export const LEGACY_AUTH_STORAGE_KEY = "jobapp-auth";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  /** "Remember me": tokens live in localStorage and survive a browser restart; otherwise in
   *  sessionStorage, so closing the browser signs out. The password is never stored. */
  rememberMe: boolean;
  setAuth: (data: { accessToken: string; refreshToken: string; user: User; rememberMe?: boolean }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
}

type PersistedAuth = Pick<AuthState, "accessToken" | "refreshToken" | "user" | "rememberMe">;

// Storage can throw (private mode, blocked site data); treat that as "nothing stored".
function read(store: () => Storage, key: string): StorageValue<PersistedAuth> | null {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as StorageValue<PersistedAuth>) : null;
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: StorageValue<PersistedAuth> | null) {
  try {
    if (value) store().setItem(key, JSON.stringify(value));
    else store().removeItem(key);
  } catch {
    /* ignore */
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** Saves to localStorage or sessionStorage depending on the remember-me flag of the state
 *  being saved, and clears the other one so tokens never sit in both. */
export const authStorage: PersistStorage<PersistedAuth> = {
  getItem: (name) => {
    const current = read(local, name) ?? read(session, name);
    if (current) return current;
    const legacy = read(local, LEGACY_AUTH_STORAGE_KEY);
    if (!legacy) return null;
    // Sessions under the old key were always kept in localStorage, i.e. remembered.
    const migrated = { ...legacy, state: { ...legacy.state, rememberMe: true } };
    write(local, name, migrated);
    write(local, LEGACY_AUTH_STORAGE_KEY, null);
    return migrated;
  },
  setItem: (name, value) => {
    const [keep, drop] = value.state.rememberMe ? [local, session] : [session, local];
    write(keep, name, value);
    write(drop, name, null);
  },
  removeItem: (name) => {
    write(local, name, null);
    write(session, name, null);
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      rememberMe: false,
      setAuth: ({ accessToken, refreshToken, user, rememberMe = false }) =>
        set({ accessToken, refreshToken, user, rememberMe }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null, rememberMe: false }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: authStorage,
      partialize: ({ accessToken, refreshToken, user, rememberMe }) => ({ accessToken, refreshToken, user, rememberMe }),
    },
  ),
);
