import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type {
  InboxCategory, InboxMessage, InboxStats, InboxSyncState,
} from "../types/api";

const api = {
  listCategories: vi.fn(),
  stats: vi.fn(),
  syncState: vi.fn(),
  listMessages: vi.fn(),
  getMessage: vi.fn(),
  setCategory: vi.fn(),
  bulkSetCategory: vi.fn(),
  deleteMessages: vi.fn(),
  startSync: vi.fn(),
  startClassify: vi.fn(),
  jobProgress: vi.fn(),
  seedDefaultCategories: vi.fn(),
  verify: vi.fn(),
};

vi.mock("../services/inbox.api", () => ({ inboxApi: api }));

const { default: Inbox } = await import("./Inbox");

function category(over: Partial<InboxCategory> = {}): InboxCategory {
  return {
    id: 1, name: "OTP", slug: "otp", description: "codes", color: "#F59E0B",
    sortOrder: 0, trackSubStatus: false, ruleCount: 2, messageCount: 3, unreadCount: 1,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
  };
}

function message(over: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 1, categoryId: 1, categoryName: "OTP", categoryColor: "#F59E0B",
    assignmentSource: "RULE", matchedRuleId: 7, matchedRuleLabel: 'subject contains "otp"',
    aiConfidence: null, aiReason: null, manualOverride: false, classifiedAt: null,
    jobStatus: null, jobCompany: null, jobRole: null,
    fromName: "Bank", fromAddress: "noreply@bank.com", fromDomain: "bank.com",
    subject: "Your OTP code", snippet: "Code 123456",
    receivedAt: new Date().toISOString(), isUnread: true, hasAttachments: false,
    state: "ACTIVE", deleteError: null, ...over,
  };
}

const stats: InboxStats = {
  total: 3, uncategorized: 0, unread: 1, trashed: 0,
  byRule: 3, byAi: 0, byManual: 0, byJobStatus: [],
  byCategory: [{ categoryId: 1, name: "OTP", color: "#F59E0B", trackSubStatus: false, count: 3, unread: 1 }],
  lastSyncAt: "2026-01-15T09:00:00Z", lastSyncStatus: "SUCCESS", lastSyncError: null,
};

const syncState: InboxSyncState = {
  enabled: true, lastSyncAt: "2026-01-15T09:00:00Z", lastSyncStatus: "SUCCESS",
  lastSyncError: null, lastSyncErrorCode: null, consecutiveFailures: 0,
  nextAttemptAt: null, initialSyncDoneAt: "2026-01-01T00:00:00Z",
  messagesFetchedLast: 10, syncWindowDays: 30, gmailConfigured: true,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listCategories.mockResolvedValue({
    categories: [category()],
    uncategorized: { messageCount: 0, unreadCount: 0 },
  });
  api.stats.mockResolvedValue(stats);
  api.syncState.mockResolvedValue(syncState);
  api.listMessages.mockResolvedValue({ messages: [message()], total: 1, page: 1, limit: 25 });
  api.deleteMessages.mockResolvedValue({ requested: 1, trashed: 1, failed: 0, failures: [] });
  api.bulkSetCategory.mockResolvedValue({ updated: 2 });
  api.seedDefaultCategories.mockResolvedValue({ created: 7 });
});

describe("Inbox page", () => {
  it("lists mail with the reason it was sorted", async () => {
    renderPage();
    expect(await screen.findByText("Your OTP code")).toBeInTheDocument();
    expect(screen.getByText(/subject contains "otp"/)).toBeInTheDocument();
  });

  it("shows category counts from a single stats call", async () => {
    renderPage();
    await screen.findByText("Your OTP code");
    expect(api.stats).toHaveBeenCalled();
    expect(screen.getAllByText("OTP").length).toBeGreaterThan(0);
  });

  it("prompts to define categories and issues NO classify call when there are none", async () => {
    api.listCategories.mockResolvedValue({
      categories: [],
      uncategorized: { messageCount: 5, unreadCount: 2 },
    });
    renderPage();

    expect(await screen.findByText(/Sorting is off until you define categories/i)).toBeInTheDocument();
    // The load-bearing assertion: the page must not try to sort before categories exist.
    expect(api.startClassify).not.toHaveBeenCalled();
  });

  it("seeds the suggested categories on request", async () => {
    api.listCategories.mockResolvedValue({
      categories: [],
      uncategorized: { messageCount: 0, unreadCount: 0 },
    });
    renderPage();

    fireEvent.click(await screen.findByText("Use suggested categories"));
    await waitFor(() => expect(api.seedDefaultCategories).toHaveBeenCalled());
  });

  it("asks the user to connect Gmail when no app password is saved", async () => {
    api.syncState.mockResolvedValue({ ...syncState, gmailConfigured: false });
    renderPage();
    expect(await screen.findByText(/Connect your Gmail to read your inbox/i)).toBeInTheDocument();
  });

  it("surfaces an actionable message when the app password was rejected", async () => {
    api.syncState.mockResolvedValue({
      ...syncState,
      lastSyncStatus: "ERROR",
      lastSyncErrorCode: "AUTH_FAILED",
      lastSyncError: "Gmail rejected the app password.",
    });
    renderPage();
    expect(await screen.findByText(/Gmail rejected the app password/i)).toBeInTheDocument();
    expect(screen.getByText(/can lock the account/i)).toBeInTheDocument();
  });

  it("reveals the bulk bar once rows are selected", async () => {
    api.listMessages.mockResolvedValue({
      messages: [message(), message({ id: 2, subject: "Second" })],
      total: 2, page: 1, limit: 25,
    });
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });

  it("selects every row on the page from the header checkbox", async () => {
    api.listMessages.mockResolvedValue({
      messages: [message(), message({ id: 2, subject: "Second" })],
      total: 2, page: 1, limit: 25,
    });
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getByLabelText("Select all on this page"));
    expect(await screen.findByText("2 selected")).toBeInTheDocument();
  });

  it("names Gmail Trash in the delete dialog and only deletes after confirming", async () => {
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(await screen.findByText("Move to Gmail Trash"));

    expect(await screen.findByText(/recoverable in Gmail's Trash for 30 days/i)).toBeInTheDocument();
    expect(screen.getByText(/only action Mailnex ever takes inside your Gmail/i)).toBeInTheDocument();
    // Nothing has been deleted yet — the dialog is a real gate.
    expect(api.deleteMessages).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Move to Trash"));
    await waitFor(() => expect(api.deleteMessages).toHaveBeenCalledWith([1]));
  });

  it("cancelling the delete dialog deletes nothing", async () => {
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(await screen.findByText("Move to Gmail Trash"));
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => expect(screen.queryByText("Move to Trash")).not.toBeInTheDocument());
    expect(api.deleteMessages).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and names what failed on a partial delete", async () => {
    api.deleteMessages.mockResolvedValue({
      requested: 1, trashed: 0, failed: 1,
      failures: [{ id: 1, error: "Couldn't move to Gmail Trash — try again." }],
    });
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(await screen.findByText("Move to Gmail Trash"));
    fireEvent.click(screen.getByText("Move to Trash"));

    expect(await screen.findByText(/Some emails could not be moved/i)).toBeInTheDocument();
    expect(screen.getByText(/back in your inbox/i)).toBeInTheDocument();
  });

  it("moves a message with one click on the row's category picker", async () => {
    api.setCategory.mockResolvedValue(message({ categoryId: null, assignmentSource: "MANUAL" }));
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.change(screen.getByLabelText("Change category"), { target: { value: "" } });
    await waitFor(() => expect(api.setCategory).toHaveBeenCalledWith(1, null));
  });

  it("performs a bulk move in a single request", async () => {
    api.listMessages.mockResolvedValue({
      messages: [message(), message({ id: 2, subject: "Second" })],
      total: 2, page: 1, limit: 25,
    });
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.change(await screen.findByLabelText("Move selected to category"), {
      target: { value: "uncategorized" },
    });
    fireEvent.click(screen.getByText("Move"));

    await waitFor(() => expect(api.bulkSetCategory).toHaveBeenCalledWith([1, 2], null));
  });

  it("starts a sync and polls its progress", async () => {
    api.startSync.mockResolvedValue({ jobId: "job-1" });
    api.jobProgress.mockResolvedValue({
      jobId: "job-1", kind: "sync", phase: "done", processed: 5, total: 5, done: true,
      result: { outcome: "ok", fetched: 5, inserted: 5, duplicates: 0 },
    });
    renderPage();
    await screen.findByText("Your OTP code");

    fireEvent.click(screen.getByText("Sync now"));
    await waitFor(() => expect(api.startSync).toHaveBeenCalled());
  });

  it("shows the job pipeline only for a category that tracks stages", async () => {
    api.listCategories.mockResolvedValue({
      categories: [category({ id: 2, name: "Job Applications", trackSubStatus: true })],
      uncategorized: { messageCount: 0, unreadCount: 0 },
    });
    api.stats.mockResolvedValue({
      ...stats,
      byJobStatus: [{ status: "INTERVIEW_INVITE", count: 2 }],
      byCategory: [{ categoryId: 2, name: "Job Applications", color: "#10B981", trackSubStatus: true, count: 3, unread: 0 }],
    });
    renderPage();
    await screen.findByText("Your OTP code");

    // Not shown while "All mail" is selected.
    expect(screen.queryByText("Interview")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Job Applications")[0]!);
    expect(await screen.findByText("Interview")).toBeInTheDocument();
  });

  it("explains an empty category rather than showing a blank panel", async () => {
    api.listMessages.mockResolvedValue({ messages: [], total: 0, page: 1, limit: 25 });
    renderPage();
    expect(await screen.findByText(/No emails in this category yet/i)).toBeInTheDocument();
  });
});
