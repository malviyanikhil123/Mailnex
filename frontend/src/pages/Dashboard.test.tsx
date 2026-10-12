import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DashboardStats } from "../types/api";

const analyticsApi = { dashboard: vi.fn(), daily: vi.fn(), monthly: vi.fn() };
vi.mock("../services/analytics.api", () => ({ analyticsApi }));
// Recharts needs ResizeObserver and real layout; the charts aren't what's under test here.
vi.mock("../components/charts/Charts", () => ({ LineTrend: () => null, RatePie: () => null }));

const { default: Dashboard } = await import("./Dashboard");

const stats: DashboardStats = {
  totalContacts: 120, pending: 30, sent: 80, failed: 6, bounced: 4, emailsSentToday: 12,
  successRate: 88.9, failureRate: 11.1, totalImportedContacts: 140, totalEmailsGenerated: 95,
  totalEmailsSent: 80, totalBounced: 4, totalFailed: 6, aiUsagePercent: 42.5, averageEmailsPerDay: 9.5,
  importHistory: [],
};

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  analyticsApi.dashboard.mockResolvedValue(stats);
  analyticsApi.daily.mockResolvedValue([]);
  analyticsApi.monthly.mockResolvedValue([]);
});

describe("Dashboard", () => {
  it("shows each stat once, including the former Analytics ones", async () => {
    renderDashboard();
    expect(await screen.findByText("Contacts")).toBeInTheDocument();
    for (const label of ["Waiting to send", "Sent today", "Avg emails / day", "Emails generated", "Emails sent", "Failed", "Bounced"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.getByText("140 imported in total")).toBeInTheDocument();
    expect(screen.getByText("42.5% personalized with AI")).toBeInTheDocument();
    expect(screen.getByText("Monthly trend")).toBeInTheDocument();
    expect(analyticsApi.monthly).toHaveBeenCalledWith(12);
  });

  it("switches the daily trend between 14 and 30 days", async () => {
    renderDashboard();
    const thirty = await screen.findByRole("button", { name: "30 days" });
    expect(screen.getByRole("button", { name: "14 days" })).toHaveAttribute("aria-pressed", "true");
    expect(analyticsApi.daily).toHaveBeenCalledWith(14);

    fireEvent.click(thirty);

    await waitFor(() => expect(analyticsApi.daily).toHaveBeenCalledWith(30));
    expect(thirty).toHaveAttribute("aria-pressed", "true");
  });
});
