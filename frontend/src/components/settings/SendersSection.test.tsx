import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const sendersApi = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
const settingsApi = { updateSending: vi.fn(), updateGmail: vi.fn() };

vi.mock("../../services/senders.api", () => ({ sendersApi }));
vi.mock("../../services/settings.api", () => ({ settingsApi }));

const { SendersSection } = await import("./SendersSection");
const { GmailSection } = await import("./GmailSection");

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const APP_PW_ERROR = "App password must be the 16-letter code from Google (spaces are fine)";

beforeEach(() => {
  vi.clearAllMocks();
  sendersApi.list.mockResolvedValue([
    { id: 7, label: "Sales", email: "sales@acme.io", dailyLimit: 40, active: true, createdAt: "2026-01-01T00:00:00Z" },
  ]);
  sendersApi.update.mockResolvedValue({});
  sendersApi.create.mockResolvedValue({});
  settingsApi.updateGmail.mockResolvedValue({});
});

describe("SendersSection", () => {
  it("changes a sender's app password with an inline form instead of a prompt", async () => {
    const prompt = vi.spyOn(window, "prompt");
    wrap(<SendersSection primaryEmail="me@gmail.com" primaryLimit={50} onSaved={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Change password" }));
    const input = screen.getByLabelText("New app password for sales@acme.io");

    fireEvent.change(input, { target: { value: "too short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText(APP_PW_ERROR)).toBeInTheDocument();
    expect(sendersApi.update).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "abcd efgh ijkl mnop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(sendersApi.update).toHaveBeenCalledWith(7, { appPassword: "abcd efgh ijkl mnop" }));
    await waitFor(() => expect(screen.queryByLabelText("New app password for sales@acme.io")).not.toBeInTheDocument());
    expect(prompt).not.toHaveBeenCalled();
  });

  it("shows 'Verifying with Gmail…' only for the password being changed, not for other updates", async () => {
    sendersApi.list.mockResolvedValue([
      { id: 7, label: "Sales", email: "sales@acme.io", dailyLimit: 40, active: true, createdAt: "2026-01-01T00:00:00Z" },
      { id: 8, label: "Ops", email: "ops@acme.io", dailyLimit: 40, active: true, createdAt: "2026-01-01T00:00:00Z" },
    ]);
    sendersApi.update.mockReturnValue(new Promise(() => {})); // stays pending
    wrap(<SendersSection primaryEmail={null} primaryLimit={50} onSaved={() => {}} />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Change password" }))[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[1]);

    await waitFor(() => expect(sendersApi.update).toHaveBeenCalledWith(8, { active: false }));
    expect(screen.getByRole("button", { name: "Save password" })).toBeInTheDocument();
    expect(screen.queryByText("Verifying with Gmail…")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New app password for sales@acme.io"), { target: { value: "abcd efgh ijkl mnop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("button", { name: "Verifying with Gmail…" })).toBeDisabled();
  });

  it("links to Google's app password page in a new tab next to each app password input", async () => {
    wrap(<SendersSection primaryEmail={null} primaryLimit={50} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Change password" }));

    const links = screen.getAllByRole("link", { name: "Create an app password" });
    expect(links).toHaveLength(2); // add-sender form + change-password form
    for (const link of links) {
      expect(link).toHaveAttribute("href", "https://myaccount.google.com/apppasswords");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getAllByText(/Needs 2-Step Verification\. Copy the 16-letter password Google shows you\./)).toHaveLength(2);
  });

  it("validates the new sender's email and app password before calling the API", async () => {
    wrap(<SendersSection primaryEmail={null} primaryLimit={50} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Ops" } });
    fireEvent.change(screen.getByLabelText("Gmail address"), { target: { value: "ops@" } });
    fireEvent.change(screen.getByLabelText("App password"), { target: { value: "nope" } });

    fireEvent.click(screen.getByRole("button", { name: "+ Add sender" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText(APP_PW_ERROR)).toBeInTheDocument();
    expect(sendersApi.create).not.toHaveBeenCalled();
  });
});

describe("GmailSection", () => {
  it("shows inline errors and only saves a valid address and app password", async () => {
    wrap(<GmailSection configured={false} email={null} onSaved={() => {}} />);
    const address = screen.getByLabelText("Gmail address");
    const password = screen.getByLabelText("App password");

    fireEvent.change(address, { target: { value: "me" } });
    fireEvent.change(password, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Gmail" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText(APP_PW_ERROR)).toBeInTheDocument();
    expect(settingsApi.updateGmail).not.toHaveBeenCalled();

    fireEvent.change(address, { target: { value: "me@company.com" } });
    fireEvent.change(password, { target: { value: "abcd efgh ijkl mnop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Gmail" }));
    await waitFor(() => expect(settingsApi.updateGmail).toHaveBeenCalledWith("me@company.com", "abcd efgh ijkl mnop"));
    expect(screen.getByRole("link", { name: "Create an app password" })).toHaveAttribute("target", "_blank");
  });
});
