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

  it("drops an old key re-created by a stale tab when signing out", async () => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });
    // A tab still on the old bundle writes the old key again after the migration.
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(legacy));

    useAuth.getState().clear();
    sessionStorage.clear(); // a fresh tab / browser restart
    await useAuth.persist.rehydrate();

    expect(localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)).toBeNull();
    expect(useAuth.getState()).toMatchObject({ accessToken: null, refreshToken: null, user: null });
  });

  it("prefers the new key when both exist", () => {
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify(legacy));
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    const value = authStorage.getItem(AUTH_STORAGE_KEY) as { state: unknown } | null;

    expect(value?.state).toMatchObject({ refreshToken: "r", rememberMe: false });
  });
  it("prefers this tab's own session over another user's remembered one", () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ state: { accessToken: "b", refreshToken: "rb", user: { ...user, id: 2 }, rememberMe: true }, version: 0 }),
    );
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ state: { accessToken: "a", refreshToken: "ra", user, rememberMe: false }, version: 0 }),
    );

    const value = authStorage.getItem(AUTH_STORAGE_KEY) as { state: { refreshToken: string } } | null;

    expect(value?.state.refreshToken).toBe("ra");
  });

  it("uses the remembered session when this tab's own storage only holds a sign-out", () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ state: { accessToken: "b", refreshToken: "rb", user, rememberMe: true }, version: 0 }),
    );
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ state: { accessToken: null, refreshToken: null, user: null, rememberMe: false }, version: 0 }),
    );

    const value = authStorage.getItem(AUTH_STORAGE_KEY) as { state: { refreshToken: string } } | null;

    expect(value?.state.refreshToken).toBe("rb");
  });
});
