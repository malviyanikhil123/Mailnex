import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { AiProviderStatus } from "../../types/api";

const templates = { generateHtml: vi.fn() };
const ai = { list: vi.fn() };
vi.mock("../../services/templates.api", () => ({ templatesApi: templates }));
vi.mock("../../services/ai.api", () => ({ aiApi: ai }));

const { GenerateHtmlDialog } = await import("./GenerateHtmlDialog");

function provider(over: Partial<AiProviderStatus> = {}): AiProviderStatus {
  return {
    provider: "openai", label: "OpenAI", configured: true, keyLast4: "WXYZ", defaultModel: "m", isDefault: true,
    models: ["m"], keyUrl: "https://example.com", updatedAt: null, ...over,
  };
}

function renderDialog() {
  const onClose = vi.fn();
  const onGenerated = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GenerateHtmlDialog onClose={onClose} onGenerated={onGenerated} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose, onGenerated };
}

const DESCRIPTION = "Announce our booking app to local gyms";

describe("GenerateHtmlDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ai.list.mockResolvedValue([
      provider(),
      provider({ provider: "groq", label: "Groq", isDefault: false }),
      provider({ provider: "anthropic", label: "Anthropic Claude", configured: false, isDefault: false }),
    ]);
  });

  it("points to Settings when no provider is connected", async () => {
    ai.list.mockResolvedValue([provider({ configured: false, isDefault: false })]);
    const { onClose } = renderDialog();
    const link = await screen.findByRole("link", { name: /Settings → AI providers/ });
    expect(link).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "Generate design" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error when the providers cannot be loaded", async () => {
    ai.list.mockRejectedValue(new Error("offline"));
    renderDialog();
    expect(await screen.findByText(/Could not load your AI providers/)).toBeInTheDocument();
  });

  it("offers only connected providers, with the default named", async () => {
    renderDialog();
    const select = await screen.findByLabelText("AI provider");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Default (OpenAI)", "OpenAI", "Groq"]);
  });

  it("needs a description of at least 10 characters and a valid hex color", async () => {
    renderDialog();
    const generate = await screen.findByRole("button", { name: "Generate design" });
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What should the email be about?"), { target: { value: "  too short " } });
    expect(screen.getByText(`9/2000`)).toBeInTheDocument();
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What should the email be about?"), { target: { value: DESCRIPTION } });
    expect(generate).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Brand color (optional)"), { target: { value: "blue" } });
    expect(screen.getByText(/Use a hex color/)).toBeInTheDocument();
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Brand color (optional)"), { target: { value: "#0f0" } });
    expect(screen.queryByText(/Use a hex color/)).not.toBeInTheDocument();
    expect(generate).toBeEnabled();
  });

  it("sends the chosen options, hands the design back and closes", async () => {
    templates.generateHtml.mockResolvedValue({ html: "<html></html>", subject: "Spring news" });
    const { onClose, onGenerated } = renderDialog();
    fireEvent.change(await screen.findByLabelText("What should the email be about?"), { target: { value: `  ${DESCRIPTION}  ` } });
    fireEvent.change(screen.getByLabelText("Tone"), { target: { value: "Playful" } });
    fireEvent.change(screen.getByLabelText("Brand color (optional)"), { target: { value: "#2563eb" } });
    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "groq" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith({ html: "<html></html>", subject: "Spring news" }));
    expect(templates.generateHtml).toHaveBeenCalledWith({
      description: DESCRIPTION, tone: "Playful", brandColor: "#2563eb", includeVariables: false, provider: "groq",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("uses the default provider when none is picked, and shows the server's error", async () => {
    templates.generateHtml.mockRejectedValue({ response: { data: { message: "Groq rejected the key" } } });
    const { onClose, onGenerated } = renderDialog();
    fireEvent.change(await screen.findByLabelText("What should the email be about?"), { target: { value: DESCRIPTION } });
    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Groq rejected the key");
    expect(templates.generateHtml).toHaveBeenCalledWith(expect.objectContaining({ provider: null, includeVariables: true, brandColor: undefined }));
    expect(onGenerated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
