import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Template } from "../types/api";
import { useToast } from "../store/toast";

const templates = { list: vi.fn(), remove: vi.fn(), preview: vi.fn(), addStarter: vi.fn(), create: vi.fn(), update: vi.fn(), generateHtml: vi.fn() };
const settings = { get: vi.fn(), listDocuments: vi.fn() };
vi.mock("../services/templates.api", () => ({ templatesApi: templates }));
vi.mock("../services/settings.api", () => ({ settingsApi: settings }));
vi.mock("../services/ai.api", () => ({ aiApi: { list: vi.fn().mockResolvedValue([]) } }));

const { default: Templates } = await import("./Templates");

function template(over: Partial<Template> = {}): Template {
  return {
    id: 1, name: "Cold intro", subject: "Idea for {{company|your team}}", body: "Hi {{first_name|there}},",
    format: "text", category: "sales", version: 1, active: false, documentId: null, document: null,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Templates />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Templates page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToast.setState({ toasts: [] });
    templates.list.mockResolvedValue([
      template(),
      template({ id: 2, name: "Spring newsletter", format: "html", category: "offer", body: "<html><head><style>p{color:red}</style></head><body><p>Fresh &amp; new</p></body></html>" }),
    ]);
    settings.get.mockResolvedValue({ profile: { name: "Priya" }, profileFields: [] });
    settings.listDocuments.mockResolvedValue({ documents: [], limits: { maxDocuments: 10, maxBytes: 1, extensions: [] } });
  });

  it("shows format badges and readable excerpts, and no sending-selection controls", async () => {
    renderPage();
    expect(await screen.findByText("Spring newsletter")).toBeInTheDocument();
    expect(screen.getByText("HTML design")).toBeInTheDocument();
    expect(screen.getByText("Plain text")).toBeInTheDocument();
    expect(screen.getByText("Fresh & new")).toBeInTheDocument();
    expect(screen.queryByText(/Selected for Sending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select All/i)).not.toBeInTheDocument();
  });

  it("adds the missing starter templates", async () => {
    templates.addStarter.mockResolvedValue({ added: 6 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add starter templates" }));
    await waitFor(() => expect(templates.addStarter).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useToast.getState().toasts.map((t) => t.message)).toContain("Added 6 starter templates"));
    expect(templates.list).toHaveBeenCalledTimes(2);
  });

  it("says so when the user already has every starter template", async () => {
    templates.addStarter.mockResolvedValue({ added: 0 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add starter templates" }));
    await waitFor(() =>
      expect(useToast.getState().toasts.map((t) => t.message)).toContain("You already have all the starter templates"),
    );
  });

  it("previews an HTML template in a sandboxed frame using the profile and a sample contact", async () => {
    templates.preview.mockResolvedValue({ subject: "Hi", body: "<p>Hello Jordan</p>", format: "html" });
    renderPage();
    await screen.findByText("Spring newsletter");
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[1]);
    const frame = (await screen.findByTitle("Email preview")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("Hello Jordan");
    const vars = templates.preview.mock.calls[0][1];
    expect(vars).toMatchObject({ my_name: "Priya", first_name: "Jordan", company: "Acme Co" });
    expect(vars).not.toHaveProperty("candidateName");
  });
});
