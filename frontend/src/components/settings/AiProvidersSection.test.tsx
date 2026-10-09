import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiProviderStatus } from "../../types/api";

const api = { list: vi.fn(), save: vi.fn(), setDefault: vi.fn(), remove: vi.fn() };
vi.mock("../../services/ai.api", () => ({ aiApi: api }));

const { AiProvidersSection, apiKeyProblem, MODEL_ID_PATTERN } = await import("./AiProvidersSection");

const KEYS = {
  openai: "sk-proj-" + "a".repeat(40),
  anthropic: "sk-ant-api03-" + "b".repeat(40),
  google: "AIza" + "c".repeat(35),
  groq: "gsk_" + "d".repeat(52),
};

function provider(over: Partial<AiProviderStatus> & Pick<AiProviderStatus, "provider" | "label">): AiProviderStatus {
  return {
    configured: false, keyLast4: null, defaultModel: "m-1", isDefault: false,
    models: ["m-1", "m-2"], keyUrl: "https://example.com/keys", updatedAt: null, ...over,
  };
}

function renderSection(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AiProvidersSection onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved };
}

describe("apiKeyProblem", () => {
  it("accepts a well-formed key for each provider", () => {
    for (const [p, key] of Object.entries(KEYS)) expect(apiKeyProblem(p as keyof typeof KEYS, key)).toBeNull();
  });

  it("trims surrounding whitespace but rejects inner whitespace", () => {
    expect(apiKeyProblem("groq", `  ${KEYS.groq}\n`)).toBeNull();
    expect(apiKeyProblem("openai", "sk-abc def" + "x".repeat(20))).toMatch(/spaces/);
  });

  it("explains wrong prefixes, wrong providers and wrong lengths", () => {
    expect(apiKeyProblem("openai", "abc123")).toMatch(/start with "sk-"/);
    expect(apiKeyProblem("openai", KEYS.anthropic)).toMatch(/key for Anthropic Claude/);
    expect(apiKeyProblem("google", "AIza" + "c".repeat(10))).toMatch(/39 characters/);
    expect(apiKeyProblem("groq", "gsk_short")).toMatch(/40–200 characters/);
  });

  it("uses the same model id rule as the server", () => {
    expect(MODEL_ID_PATTERN.test("ft:gpt-5.4-mini:acme")).toBe(true);
    expect(MODEL_ID_PATTERN.test("a/../b")).toBe(false);
  });
});

describe("AiProvidersSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue([
      provider({ provider: "openai", label: "OpenAI", configured: true, isDefault: true, keyLast4: "WXYZ", keyUrl: "https://platform.openai.com/api-keys" }),
      provider({ provider: "groq", label: "Groq", keyUrl: "https://console.groq.com/keys" }),
    ]);
  });

  it("shows each provider's status and a safe link to create a key", async () => {
    renderSection();
    const openai = await screen.findByTestId("ai-provider-openai");
    expect(within(openai).getByText("Default")).toBeInTheDocument();
    expect(within(openai).getByText(/key …WXYZ/)).toBeInTheDocument();
    const link = within(openai).getByRole("link", { name: /get an api key/i });
    expect(link).toHaveAttribute("href", "https://platform.openai.com/api-keys");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(screen.getByTestId("ai-provider-groq")).getByText("Not connected")).toBeInTheDocument();
  });

  it("keeps the key input write-only", async () => {
    renderSection();
    const input = await screen.findByLabelText("Groq API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("");
  });

  it("blocks a badly formatted key before calling the server", async () => {
    renderSection();
    fireEvent.change(await screen.findByLabelText("Groq API key"), { target: { value: "sk-wrong-provider-key-123456" } });
    expect(screen.getByText(/key for OpenAI/)).toBeInTheDocument();
    const groq = screen.getByTestId("ai-provider-groq");
    expect(within(groq).getByRole("button", { name: "Connect" })).toBeDisabled();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("connects a provider with its key and model", async () => {
    const { onSaved } = renderSection();
    api.save.mockResolvedValue([]);
    fireEvent.change(await screen.findByLabelText("Groq API key"), { target: { value: KEYS.groq } });
    fireEvent.change(screen.getByLabelText("Groq model"), { target: { value: "m-2" } });
    fireEvent.click(within(screen.getByTestId("ai-provider-groq")).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith("groq", { apiKey: KEYS.groq, defaultModel: "m-2" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("offers Make default and Remove only for a connected, non-default provider", async () => {
    api.list.mockResolvedValue([
      provider({ provider: "openai", label: "OpenAI", configured: true, isDefault: true }),
      provider({ provider: "anthropic", label: "Anthropic Claude", configured: true }),
      provider({ provider: "groq", label: "Groq" }),
    ]);
    api.setDefault.mockResolvedValue([]);
    renderSection();
    const anthropic = await screen.findByTestId("ai-provider-anthropic");
    expect(within(screen.getByTestId("ai-provider-openai")).queryByText("Make default")).toBeNull();
    expect(within(screen.getByTestId("ai-provider-groq")).queryByText("Remove")).toBeNull();
    fireEvent.click(within(anthropic).getByText("Make default"));
    await waitFor(() => expect(api.setDefault).toHaveBeenCalledWith("anthropic"));
  });
});
