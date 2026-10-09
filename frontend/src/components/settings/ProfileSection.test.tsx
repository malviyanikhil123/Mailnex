import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SenderProfile } from "../../types/api";

const api = { updateProfile: vi.fn() };

vi.mock("../../services/settings.api", () => ({ settingsApi: api }));

const { ProfileSection } = await import("./ProfileSection");

function renderSection(profile: SenderProfile) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ProfileSection profile={profile} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved };
}

describe("ProfileSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the generic profile fields with their template variables, not job-seeker ones", () => {
    renderSection({});
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    for (const label of ["Full name", "Company / organization", "Email", "Phone", "Website", "LinkedIn", "Email signature"]) {
      expect(screen.getByLabelText(new RegExp(`^${label}\\{\\{`))).toBeInTheDocument();
    }
    expect(screen.getAllByText("{{my_company}}").length).toBeGreaterThan(0);
    for (const gone of [/Role/, /Experience/, /Skills/, /GitHub/, /Portfolio/]) {
      expect(screen.queryByLabelText(gone)).not.toBeInTheDocument();
    }
  });

  it("previews the default signature while the signature is empty", () => {
    renderSection({ name: "Priya Shah", company: "Northwind", website: "https://northwind.com" });
    expect(screen.getByLabelText(/^Email signature/)).toHaveAttribute(
      "placeholder",
      "Best regards,\nPriya Shah\nNorthwind\nhttps://northwind.com",
    );
  });

  it("saves only the fields it edits, leaving older stored keys alone", async () => {
    api.updateProfile.mockResolvedValue({});
    const stored = { name: "Alex", email: "a@x.dev", role: "Engineer", github: "gh" } as SenderProfile;
    const { onSaved } = renderSection(stored);

    fireEvent.change(screen.getByLabelText(/^Company/), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText(/^Email signature/), { target: { value: "Thanks,\nAlex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updateProfile).toHaveBeenCalledWith({
      name: "Alex", company: "Acme", email: "a@x.dev", phone: "", website: "", linkedin: "", signature: "Thanks,\nAlex",
    });
  });
});
