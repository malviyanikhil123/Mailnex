import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";

export function ProtectedRoute() {
  const token = useAuth((s) => s.accessToken);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
