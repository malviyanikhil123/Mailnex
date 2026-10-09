import { describe, it, expect, beforeEach } from "vitest";
import { AUTH_STORAGE_KEY, LEGACY_AUTH_STORAGE_KEY, authStorage, useAuth } from "./auth";

const user = { id: 1, name: "Jane", email: "jane@example.com" };

function stored(store: Storage) {
  const raw = store.getItem(AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw).state : null;
}

beforeEach(() => {
  useAuth.getState().clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("auth store storage", () => {
  it("keeps a remembered session in localStorage only", () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });

    expect(stored(localStorage)).toMatchObject({ accessToken: "a", refreshToken: "r", rememberMe: true, user });
    expect(stored(sessionStorage)).toBeNull();
  });

  it("keeps a session that is not remembered in sessionStorage only", () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    expect(stored(sessionStorage)).toMatchObject({ refreshToken: "r", rememberMe: false });
    expect(stored(localStorage)).toBeNull();
  });

  it("keeps refreshed tokens where the sign-in put them", () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });
    useAuth.getState().setTokens("a2", "r2");

    expect(stored(localStorage)).toMatchObject({ accessToken: "a2", refreshToken: "r2", rememberMe: true });
    expect(stored(sessionStorage)).toBeNull();
  });

  it("moves the session when the next sign-in is not remembered", () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });
    useAuth.getState().setAuth({ accessToken: "b", refreshToken: "s", user, rememberMe: false });

    expect(stored(localStorage)).toBeNull();
    expect(stored(sessionStorage)).toMatchObject({ refreshToken: "s" });
  });

  it("leaves no tokens in localStorage after sign-out", () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });
    useAuth.getState().clear();

    expect(stored(localStorage)).toBeNull();
    expect(stored(sessionStorage)).toMatchObject({ accessToken: null, refreshToken: null });
  });
});

describe("legacy storage key", () => {
  const legacy = { state: { accessToken: "old-a", refreshToken: "old-r", user }, version: 0 };

  it("moves jobapp-auth to the new key once, as a remembered session", () => {
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(legacy));

    const value = authStorage.getItem(AUTH_STORAGE_KEY) as { state: unknown } | null;

    expect(value?.state).toMatchObject({ refreshToken: "old-r", rememberMe: true });
    expect(localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)).toBeNull();
    expect(stored(localStorage)).toMatchObject({ refreshToken: "old-r", rememberMe: true });
  });

  it("signs the user back in on rehydrate", async () => {
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(legacy));

    await useAuth.persist.rehydrate();

    expect(useAuth.getState()).toMatchObject({ accessToken: "old-a", refreshToken: "old-r", user, rememberMe: true });
  });

  it("prefers the new key when both exist", () => {
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(legacy));
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    const value = authStorage.getItem(AUTH_STORAGE_KEY) as { state: unknown } | null;

    expect(value?.state).toMatchObject({ refreshToken: "r", rememberMe: false });
  });
});
