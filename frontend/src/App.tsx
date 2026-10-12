import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { GuestRoute } from "./routes/GuestRoute";
import { AppLayout } from "./layouts/AppLayout";
import { Toaster } from "./components/ui/Toaster";
import { useTheme } from "./store/theme";
import { startAuthSync } from "./store/auth-sync";
import { useClearQueriesOnUserChange } from "./hooks/useClearQueriesOnUserChange";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import InboxCategories from "./pages/InboxCategories";
import Contacts from "./pages/Contacts";
import Templates from "./pages/Templates";
import Campaign from "./pages/Campaign";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30000,
    },
  },
});

export default function App() {
  const apply = useTheme((s) => s.apply);
  useEffect(() => apply(), [apply]);

  // Share the session with other open tabs (and get theirs if this tab has none).
  useEffect(() => startAuthSync(), []);
  useClearQueriesOnUserChange(queryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/inbox/categories" element={<InboxCategories />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/campaign" element={<Campaign />} />
              <Route path="/logs" element={<Logs />} />
              {/* Analytics was merged into the Dashboard; keep old links working. */}
              <Route path="/analytics" element={<Navigate to="/" replace />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
