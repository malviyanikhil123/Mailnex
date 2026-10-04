import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { LoginGate } from "./components/LoginGate";
import { OverviewTab } from "./components/OverviewTab";
import { JobsTab } from "./components/JobsTab";
import { SourcesTab } from "./components/SourcesTab";
import { AccountsTab } from "./components/AccountsTab";
import { ProfileTab } from "./components/ProfileTab";
import { OnboardingModal } from "./components/OnboardingModal";
import { ApprovePage } from "./components/ApprovePage";
import { api } from "./services/api";
import type { Me, Profile, Settings, StatsResponse } from "./types";

export function App() {
  // Check if we are on an approval token URL: /approve/:token
  const pathname = window.location.pathname;
  const approveMatch = pathname.match(/^\/approve\/([^/]+)/);
  if (approveMatch) {
    return (
      <div className="min-h-screen bg-bg text-ink relative">
        <div className="bg-grid-field" />
        <div className="relative z-10">
          <ApprovePage token={approveMatch[1]} />
        </div>
      </div>
    );
  }

  const [user, setUser] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);

  const [currentView, setCurrentView] = useState("board");
  const [initialJobCountry, setInitialJobCountry] = useState("");
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Authenticate session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await api.getMe();
      setUser(res.me);
      setProfile(res.profile || null);
      setSettings(res.settings || null);

      // If user has not completed onboarding, pop up the onboarding modal
      if (!res.profile) {
        setIsOnboardingOpen(true);
      }

      // Load background telemetry
      loadTelemetry();
    } catch {
      setUser(null);
    } finally {
      setInitialLoading(false);
    }
  };

  const loadTelemetry = async () => {
    try {
      const [statsRes, accountsRes] = await Promise.all([
        api.getStats(),
        api.getAccounts().catch(() => ({ waiting: 0 })),
      ]);
      setStats(statsRes);
      setWaitingCount(accountsRes.waiting || 0);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setProfile(null);
    setSettings(null);
    setStats(null);
  };

  const handleCountryJump = (countryCode: string) => {
    setInitialJobCountry(countryCode);
    setCurrentView("jobs");
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-dim font-mono">
        <div className="inline-block animate-spin mr-2.5 text-aqua">◷</div>
        <span>Initializing Autopilot Radar...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg text-ink relative">
        <div className="bg-grid-field" />
        <div className="relative z-10 px-4">
          <LoginGate onSuccess={checkAuth} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink relative">
      {/* Background Cyber Grid */}
      <div className="bg-grid-field" />

      {/* Main Container */}
      <div className="app-container">
        <Header
          currentView={currentView}
          onSelectView={(v) => {
            setCurrentView(v);
            if (v === "board") loadTelemetry();
          }}
          user={user}
          onLogout={handleLogout}
          waitingCount={waitingCount}
        />

        {/* View Routing */}
        <main>
          {currentView === "board" && (
            <OverviewTab
              stats={stats}
              user={user}
              onSelectCountry={handleCountryJump}
              onGoToJobs={() => setCurrentView("jobs")}
            />
          )}

          {currentView === "jobs" && <JobsTab initialCountry={initialJobCountry} />}

          {currentView === "sources" && <SourcesTab />}

          {currentView === "accounts" && <AccountsTab />}

          {currentView === "me" && (
            <ProfileTab
              user={user}
              profile={profile}
              settings={settings}
              onOpenUploadResume={() => setIsOnboardingOpen(true)}
              onSettingsSaved={(newSettings) => setSettings(newSettings)}
            />
          )}
        </main>
      </div>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onFinished={(newProfile, newSettings) => {
          setProfile(newProfile);
          setSettings(newSettings);
          loadTelemetry();
        }}
      />
    </div>
  );
}
