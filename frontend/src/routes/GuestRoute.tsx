import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useAuthSync } from "../store/auth-sync";

/**
 * For /login and /register: a browser that already has a session goes to the app instead.
 * Signing in as someone else needs a sign-out first; otherwise the second account would
 * replace the first one in the storage every tab shares.
 */
export function GuestRoute() {
  const token = useAuth((s) => s.accessToken);
  // A new tab may still be getting the session from another open tab (≤ 300 ms).
  const ready = useAuthSync((s) => s.ready);
  if (token) return <Navigate to="/" replace />;
  return ready ? <Outlet /> : null;
}
