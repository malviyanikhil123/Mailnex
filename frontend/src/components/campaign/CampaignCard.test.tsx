import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Campaign } from "../../types/api";
import { useToast } from "../../store/toast";

const campaignApi = { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), remove: vi.fn() };
vi.mock("../../services/campaign.api", () => ({ campaignApi }));

const { CampaignCard } = await import("./CampaignCard");

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 7, name: "Spring promo", importId: 1, senderAccountId: null, templateIds: [1], mode: "LIVE", dailyLimit: 50,
    startHour: 9, endHour: 18, testEmail: null, language: "English", aiEnabled: true, aiInstructions: null,
    aiProvider: null, aiModel: null, state: "IDLE", importName: "Leads", quotaToday: 0, nextScheduledAt: null,
    countsByStatus: { PENDING: 3 }, aiActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function renderCard(c: Campaign) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CampaignCard campaign={c} senders={[]} primaryEmail={null} onEdit={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
});

describe("CampaignCard", () => {
  it("says AI enhanced when AI is on and a provider is connected", () => {
    renderCard(campaign());
    expect(screen.getByText(/AI enhanced/)).toBeInTheDocument();
    expect(screen.queryByText(/no AI provider is connected/)).not.toBeInTheDocument();
  });

  it("does not claim AI when no provider is connected, and says why", () => {
    renderCard(campaign({ aiActive: false }));
    expect(screen.queryByText(/AI enhanced/)).not.toBeInTheDocument();
    expect(screen.getByText(/No AI/)).toBeInTheDocument();
    expect(screen.getByText(/no AI provider is connected/)).toBeInTheDocument();
  });

  it("names the picked provider when only that one is missing", () => {
    renderCard(campaign({ aiActive: false, aiProvider: "openai" }));
    expect(screen.getByText(/that AI provider isn't connected/)).toBeInTheDocument();
  });

  it("just says No AI when AI is off", () => {
    renderCard(campaign({ aiEnabled: false, aiActive: false }));
    expect(screen.getByText(/No AI/)).toBeInTheDocument();
    expect(screen.queryByText(/connected/)).not.toBeInTheDocument();
  });

  it("shows the server's reason when Start is refused", async () => {
    campaignApi.start.mockRejectedValue({
      response: { status: 400, data: { message: "Connect a Gmail sender before starting this campaign" } },
    });
    renderCard(campaign());
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(useToast.getState().toasts).toContainEqual(
        expect.objectContaining({ kind: "error", message: "Connect a Gmail sender before starting this campaign" }),
      ),
    );
  });
});
