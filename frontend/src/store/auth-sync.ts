/**
 * Keeps the open tabs of this app in step over a BroadcastChannel (same-origin only).
 *
 * A session that isn't remembered lives in sessionStorage, which a new tab doesn't share,
 * so a new tab asks the open ones for theirs before showing the login page. Tabs also
 * pass on every token rotation (they share one server session, and a rotated-out token
 * is rejected) and sign out together.
 */
import { create } from "zustand";
import { AUTH_STORAGE_KEY, authStorage, useAuth, type AuthSession } from "./auth";

const CHANNEL_NAME = AUTH_STORAGE_KEY;
export const SESSION_REQUEST_TIMEOUT_MS = 300;

type Message =
  | { type: "session-request"; requestId: string }
  | { type: "session"; requestId?: string; session: AuthSession }
  /** Only tabs signed in as `userId` sign out; other users' tabs are left alone. */
  | { type: "logout"; userId: number };

/** `ready` turns true once this tab knows whether it has a session (other tabs were asked). */
export const useAuthSync = create<{ ready: boolean }>(() => ({ ready: false }));

let channel: BroadcastChannel | null = null;
let unsubscribe: (() => void) | null = null;
let applyingRemote = false;
const pending = new Map<string, (session: AuthSession) => void>();

function isSession(v: unknown): v is AuthSession {
  const s = v as Partial<AuthSession> | null;
  return (
    !!s &&
    typeof s.accessToken === "string" &&
    typeof s.refreshToken === "string" &&
    typeof s.rememberMe === "boolean" &&
    !!s.user &&
    typeof s.user.id === "number" &&
    typeof s.user.name === "string" &&
    typeof s.user.email === "string"
  );
}

/** Anything that isn't one of our messages is ignored. */
function parse(data: unknown): Message | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.type === "logout" && typeof m.userId === "number") return { type: "logout", userId: m.userId };
  if (m.type === "session-request" && typeof m.requestId === "string") {
    return { type: "session-request", requestId: m.requestId };
  }
  if (m.type === "session" && isSession(m.session) && (m.requestId === undefined || typeof m.requestId === "string")) {
    return { type: "session", requestId: m.requestId as string | undefined, session: m.session };
  }
  return null;
}

function post(message: Message) {
  try {
    channel?.postMessage(message);
  } catch {
    /* channel closed */
  }
}

function currentSession(): AuthSession | null {
  const { accessToken, refreshToken, user, rememberMe } = useAuth.getState();
  return accessToken && refreshToken && user ? { accessToken, refreshToken, user, rememberMe } : null;
}

/** Applies another tab's state without announcing it back. */
function applyRemote(change: () => void) {
  applyingRemote = true;
  try {
    change();
  } finally {
    applyingRemote = false;
  }
}

function onMessage(data: unknown) {
  const msg = parse(data);
  if (!msg) return;
  if (msg.type === "session-request") {
    const session = currentSession();
    if (session) post({ type: "session", requestId: msg.requestId, session });
  } else if (msg.type === "session") {
    if (msg.requestId !== undefined) {
      pending.get(msg.requestId)?.(msg.session);
      return;
    }
    // Another tab rotated the tokens (or signed in again): follow it so this tab doesn't
    // refresh with a token that was already replaced. Signed-out tabs stay signed out.
    const mine = useAuth.getState();
    if (mine.refreshToken && mine.user?.id === msg.session.user.id) {
      applyRemote(() => mine.setAuth(msg.session));
    }
  } else if (useAuth.getState().user?.id === msg.userId) {
    applyRemote(() => useAuth.getState().clear());
  }
}

/** Asks the other open tabs for their session; null when no answer that `accept` takes
 *  arrives in time (answers it rejects are skipped, a later tab may still have a good one). */
export function requestSession(
  timeoutMs = SESSION_REQUEST_TIMEOUT_MS,
  accept: (session: AuthSession) => boolean = () => true,
): Promise<AuthSession | null> {
  if (!channel) return Promise.resolve(null);
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pending.set(requestId, (session) => {
      if (!accept(session)) return;
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(session);
    });
    post({ type: "session-request", requestId });
  });
}

/**
 * Called when a refresh with `staleRefreshToken` was rejected. Tabs share one session, so
 * another tab may have rotated it first; returns (and adopts) its newer tokens if so.
 * Only ever a newer token of the user this tab is signed in as, so a request is never
 * retried as somebody else.
 */
export async function recoverSession(staleRefreshToken: string): Promise<AuthSession | null> {
  const userId = useAuth.getState().user?.id;
  if (userId === undefined) return null;
  const usable = (s: AuthSession | null) =>
    s && s.refreshToken !== staleRefreshToken && s.user.id === userId ? s : null;
  const adopt = (s: AuthSession) => {
    applyRemote(() => useAuth.getState().setAuth(s));
    return s;
  };

  // A broadcast may already have replaced the rejected token here.
  const own = usable(currentSession());
  if (own) return own;
  // A remembered session may have been rotated into localStorage by a tab that has closed.
  // Read it without loading it, as it may belong to someone else by now.
  if (useAuth.getState().rememberMe) {
    const saved = (await authStorage.getItem(AUTH_STORAGE_KEY))?.state;
    const stored = usable(isSession(saved) ? saved : null);
    if (stored) return adopt(stored);
  }
  // Tabs that lost the same race still hold the rejected token; wait for a newer one.
  const peer = await requestSession(SESSION_REQUEST_TIMEOUT_MS, (s) => usable(s) !== null);
  if (peer) return adopt(peer);
  // The tab that won may have announced its rotation (applied by onMessage) meanwhile.
  return usable(currentSession());
}

/** Signs this tab out and tells the other tabs signed in as the same user to do the same. */
export function signOutAllTabs() {
  const userId = useAuth.getState().user?.id;
  if (userId !== undefined) post({ type: "logout", userId });
  applyRemote(() => useAuth.getState().clear());
}

/**
 * A session this browser already has, from storage (a remembered sign-in) or from another
 * open tab; null when there is none. The login and register pages check this before
 * signing in, so a second account never replaces the one the other tabs use: localStorage
 * is shared, and a remembered sign-in there would come back in every tab on reload.
 */
export async function existingSession(timeoutMs = SESSION_REQUEST_TIMEOUT_MS): Promise<AuthSession | null> {
  const own = currentSession();
  if (own) return own;
  const saved = (await authStorage.getItem(AUTH_STORAGE_KEY))?.state;
  if (isSession(saved)) return saved;
  return requestSession(timeoutMs);
}

/** Signs this tab in with a session found by existingSession() (not announced back). */
export function adoptSession(session: AuthSession) {
  applyRemote(() => useAuth.getState().setAuth(session));
}

export function alreadySignedInMessage(session: AuthSession): string {
  return `You're already signed in as ${session.user.email} in this browser. Sign out first to use another account.`;
}

/** Opens the channel and, if this tab has no session yet, asks the others for theirs. */
export function startAuthSync() {
  if (channel || useAuthSync.getState().ready) return;
  if (typeof BroadcastChannel === "undefined") {
    useAuthSync.setState({ ready: true });
    return;
  }
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent) => onMessage(e.data);
  unsubscribe = useAuth.subscribe((state, prev) => {
    if (applyingRemote || !state.refreshToken || state.refreshToken === prev.refreshToken) return;
    const session = currentSession();
    if (session) post({ type: "session", session });
  });

  if (useAuth.getState().refreshToken) {
    useAuthSync.setState({ ready: true });
    return;
  }
  void requestSession()
    .then((session) => {
      if (session && !useAuth.getState().refreshToken) applyRemote(() => useAuth.getState().setAuth(session));
    })
    .finally(() => useAuthSync.setState({ ready: true }));
}

/** Test helper: closes the channel and resets module state. */
export function stopAuthSync() {
  unsubscribe?.();
  unsubscribe = null;
  channel?.close();
  channel = null;
  pending.clear();
  useAuthSync.setState({ ready: false });
}
