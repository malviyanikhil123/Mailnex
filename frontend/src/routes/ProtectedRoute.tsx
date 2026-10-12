import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useAuthSync } from "../store/auth-sync";

export function ProtectedRoute() {
  const token = useAuth((s) => s.accessToken);
  // A new tab may still be getting the session from another open tab (≤ 300 ms).
  const ready = useAuthSync((s) => s.ready);
  if (token) return <Outlet />;
  return ready ? <Navigate to="/login" replace /> : null;
}
