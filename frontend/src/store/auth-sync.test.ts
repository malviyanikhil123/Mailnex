import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { AUTH_STORAGE_KEY, useAuth, type AuthSession } from "./auth";
import {
  existingSession,
  recoverSession,
  signOutAllTabs,
  startAuthSync,
  stopAuthSync,
  useAuthSync,
} from "./auth-sync";

const user = { id: 1, name: "Jane", email: "jane@example.com" };
const session: AuthSession = { accessToken: "a1", refreshToken: "r1", user, rememberMe: false };

type Msg = { type?: string; requestId?: string; session?: AuthSession };

let peer: BroadcastChannel | null = null;
let heard: Msg[] = [];

/** Another open tab of the app: records what it hears and can answer session requests. */
function openPeer(answer?: AuthSession) {
  peer = new BroadcastChannel(AUTH_STORAGE_KEY);
  heard = [];
  peer.onmessage = (e: MessageEvent<Msg>) => {
    heard.push(e.data);
    if (answer && e.data?.type === "session-request") {
      peer!.postMessage({ type: "session", requestId: e.data.requestId, session: answer });
    }
  };
  return peer;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Round-trips a request through the module so everything posted before it was handled. */
async function flush(p: BroadcastChannel) {
  const requestId = `flush-${Math.random()}`;
  p.postMessage({ type: "session-request", requestId });
  await waitFor(() => expect(heard.some((m) => m.requestId === requestId)).toBe(true));
}

beforeEach(() => {
  useAuth.getState().clear();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  stopAuthSync();
  peer?.close();
  peer = null;
});

describe("auth sync between tabs", () => {
  it("lets a new tab without a session borrow the one from an open tab", async () => {
    openPeer(session);
    startAuthSync();
    expect(useAuthSync.getState().ready).toBe(false);

    await waitFor(() => expect(useAuthSync.getState().ready).toBe(true));

    expect(useAuth.getState()).toMatchObject({ accessToken: "a1", refreshToken: "r1", user, rememberMe: false });
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toContain('"refreshToken":"r1"');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    await sleep(30);
    expect(heard.filter((m) => m.type === "session")).toHaveLength(0); // not echoed back
  });

  it("falls through to the login page when no tab answers", async () => {
    openPeer();
    startAuthSync();

    await waitFor(() => expect(useAuthSync.getState().ready).toBe(true), { timeout: 2000 });

    expect(useAuth.getState().accessToken).toBeNull();
  });

  it("is ready at once with its own session and answers other tabs", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    expect(useAuthSync.getState().ready).toBe(true);

    const p = openPeer();
    p.postMessage({ type: "session-request", requestId: "x" });

    await waitFor(() => expect(heard).toContainEqual({ type: "session", requestId: "x", session }));
  });

  it("announces token rotations to the other tabs", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    openPeer();

    useAuth.getState().setTokens("a2", "r2");

    await waitFor(() =>
      expect(heard).toContainEqual({ type: "session", session: { ...session, accessToken: "a2", refreshToken: "r2" } }),
    );
  });

  it("follows another tab's rotation for the same user only, and only while signed in", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    const p = openPeer();

    p.postMessage({ type: "session", session: { ...session, accessToken: "a2", refreshToken: "r2" } });
    await waitFor(() => expect(useAuth.getState().refreshToken).toBe("r2"));

    p.postMessage({ type: "session", session: { ...session, refreshToken: "other", user: { ...user, id: 2 } } });
    await flush(p);
    expect(useAuth.getState().refreshToken).toBe("r2");

    useAuth.getState().clear();
    p.postMessage({ type: "session", session: { ...session, refreshToken: "r3" } });
    await sleep(30);
    expect(useAuth.getState().refreshToken).toBeNull();
    // Adopted tokens are not announced back (the flush answer carries a requestId).
    expect(heard.filter((m) => m.type === "session" && m.requestId === undefined)).toHaveLength(0);
  });

  it("signs out together with the other tabs", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    const p = openPeer();

    p.postMessage({ type: "logout", userId: 1 });
    await waitFor(() => expect(useAuth.getState().accessToken).toBeNull());

    useAuth.getState().setAuth(session);
    signOutAllTabs();
    expect(useAuth.getState().accessToken).toBeNull();
    await waitFor(() => expect(heard).toContainEqual({ type: "logout", userId: 1 }));
  });

  it("stays signed in when a tab signed in as another user signs out", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    const p = openPeer();

    p.postMessage({ type: "logout", userId: 2 });
    p.postMessage({ type: "logout" }); // no user: ignored too
    await flush(p);

    expect(useAuth.getState()).toMatchObject({ accessToken: "a1", user });
  });

  it("does not announce a sign-out when this tab was not signed in", async () => {
    startAuthSync();
    openPeer();
    signOutAllTabs();
    await sleep(30);
    expect(heard.filter((m) => m.type === "logout")).toHaveLength(0);
  });

  it("ignores malformed messages", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    const p = openPeer();

    for (const bad of [
      null,
      "logout",
      42,
      { type: "session", session: { ...session, user: null } },
      { type: "session", session: { ...session, accessToken: 1 } },
      { type: "session", requestId: 5, session },
      { type: "session-request" },
      { type: "nope" },
    ]) {
      p.postMessage(bad);
    }
    await flush(p);

    expect(useAuth.getState()).toMatchObject({ accessToken: "a1", refreshToken: "r1" });
    expect(heard.filter((m) => m.type === "session" && m.requestId === undefined)).toHaveLength(0);
  });
});

describe("recoverSession", () => {
  it("takes the newer tokens from the tab that rotated the shared session first", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    openPeer({ ...session, accessToken: "a3", refreshToken: "r3" });

    const recovered = await recoverSession("r1");

    expect(recovered?.refreshToken).toBe("r3");
    expect(useAuth.getState().refreshToken).toBe("r3");
  });

  it("returns this tab's tokens when a broadcast already replaced the stale ones", async () => {
    useAuth.getState().setAuth({ ...session, accessToken: "a2", refreshToken: "r2" });
    startAuthSync();

    expect((await recoverSession("r1"))?.refreshToken).toBe("r2");
  });

  it("gives up when the other tabs only have the same rejected token", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    openPeer(session);

    expect(await recoverSession("r1")).toBeNull();
  });

  it("waits past a stale answer for the rotation of the tab that won the race", async () => {
    useAuth.getState().setAuth(session);
    startAuthSync();
    openPeer(session); // another tab that lost the race too: answers with the rejected token
    const winner = new BroadcastChannel(AUTH_STORAGE_KEY);
    try {
      const recovering = recoverSession("r1");
      setTimeout(() => winner.postMessage({ type: "session", session: { ...session, accessToken: "a3", refreshToken: "r3" } }), 50);

      expect((await recovering)?.refreshToken).toBe("r3");
      expect(useAuth.getState().refreshToken).toBe("r3");
    } finally {
      winner.close();
    }
  });

  const remembered = (state: AuthSession) => JSON.stringify({ state, version: 0 });

  it("takes a newer remembered token that a closed tab saved to localStorage", async () => {
    useAuth.getState().setAuth({ ...session, rememberMe: true });
    startAuthSync();
    localStorage.setItem(AUTH_STORAGE_KEY, remembered({ ...session, accessToken: "a2", refreshToken: "r2", rememberMe: true }));

    expect((await recoverSession("r1"))?.refreshToken).toBe("r2");
    expect(useAuth.getState()).toMatchObject({ refreshToken: "r2", user, rememberMe: true });
  });

  it("never switches this tab to another user's session saved in localStorage", async () => {
    useAuth.getState().setAuth({ ...session, rememberMe: true });
    startAuthSync();
    // Someone else signed in with "remember me" in another tab and saved over the shared key.
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      remembered({ ...session, refreshToken: "theirs", user: { ...user, id: 2 }, rememberMe: true }),
    );

    expect(await recoverSession("r1")).toBeNull();
    expect(useAuth.getState().user?.id).toBe(1);
  });
});

describe("existingSession", () => {
  it("finds a remembered session another tab saved", async () => {
    startAuthSync();
    await waitFor(() => expect(useAuthSync.getState().ready).toBe(true), { timeout: 2000 });
    const other = { ...session, refreshToken: "theirs", user: { ...user, id: 2 }, rememberMe: true };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ state: other, version: 0 }));

    expect(await existingSession(50)).toMatchObject({ refreshToken: "theirs", user: { id: 2 } });
    expect(useAuth.getState().accessToken).toBeNull(); // only looked at, not loaded
  });

  it("asks the open tabs for a session that is not remembered", async () => {
    startAuthSync();
    await waitFor(() => expect(useAuthSync.getState().ready).toBe(true), { timeout: 2000 });
    openPeer(session); // signed in after this tab asked at start-up

    expect(await existingSession()).toEqual(session);
  });

  it("is null when the browser has no session", async () => {
    startAuthSync();
    await waitFor(() => expect(useAuthSync.getState().ready).toBe(true), { timeout: 2000 });
    openPeer();

    expect(await existingSession(50)).toBeNull();
  });
});
