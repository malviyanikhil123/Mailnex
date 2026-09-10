import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CrawlerLayout } from "./layouts/CrawlerLayout.js";
import { Toaster } from "./components/ui/Toaster.js";
import { useTheme } from "./store/theme.js";
import { useAuth } from "./store/auth.js";
import Dashboard from "./pages/Dashboard.js";
import Discover from "./pages/Discover.js";
import Jobs from "./pages/Jobs.js";
import Leads from "./pages/Leads.js";
import Settings from "./pages/Settings.js";
import Login from "./pages/Login.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 4000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const apply = useTheme((s) => s.apply);
  useEffect(() => apply(), [apply]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <CrawlerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
