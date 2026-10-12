import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { AiProviderStatus, Template } from "../../types/api";

const templates = { create: vi.fn(), update: vi.fn(), generateHtml: vi.fn() };
const ai = { list: vi.fn() };
vi.mock("../../services/templates.api", () => ({ templatesApi: templates }));
vi.mock("../../services/ai.api", () => ({ aiApi: ai }));

const { TemplateEditor } = await import("./TemplateEditor");

function template(over: Partial<Template> = {}): Template {
  return {
    id: 5, name: "Launch", subject: "News for {{company}}", body: "Hi {{first_name|there}},\n\nBig news.",
    format: "text", category: "sales", version: 1, active: false, documentId: null, document: null,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
  };
}

function provider(over: Partial<AiProviderStatus> = {}): AiProviderStatus {
  return {
    provider: "openai", label: "OpenAI", configured: true, keyLast4: "WXYZ", defaultModel: "m", isDefault: true,
    models: ["m"], keyUrl: "https://example.com", updatedAt: null, ...over,
  };
}

function renderEditor(t: Template | null = null) {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TemplateEditor
          template={t}
          documents={[]}
          profile={{ name: "Priya Shah", company: "Northwind" }}
          profileFields={[{ key: "offer", label: "Offer", value: "20% off" }]}
          categories={["value_proposition"]}
          onClose={onClose}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose };
}

const iframe = () => screen.getByTitle("Email preview") as HTMLIFrameElement;

describe("TemplateEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ai.list.mockResolvedValue([provider()]);
    templates.create.mockResolvedValue(template());
    templates.update.mockResolvedValue(template());
  });

  it("lists the new sender, contact and custom variables, not the job-seeker ones", () => {
    renderEditor();
    for (const v of ["{{my_name}}", "{{my_company}}", "{{signature}}", "{{first_name}}", "{{company}}", "{{contact_email}}", "{{offer}}"]) {
      expect(screen.getByRole("button", { name: v })).toBeInTheDocument();
    }
    for (const legacy of ["{{candidateName}}", "{{role}}", "{{skills}}", "{{GitHub}}"]) {
      expect(screen.queryByRole("button", { name: legacy })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/\{\{first_name\|there\}\}/)).toBeInTheDocument();
    expect(screen.getByText(/spreadsheet columns/i)).toBeInTheDocument();
  });

  it("inserts a variable at the cursor of the field used last", () => {
    renderEditor();
    const body = screen.getByLabelText("Email body") as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "Hello !" } });
    fireEvent.focus(body);
    body.setSelectionRange(6, 6);
    fireEvent.click(screen.getByRole("button", { name: "{{first_name}}" }));
    expect(body.value).toBe("Hello {{first_name}}!");

    const subject = screen.getByLabelText("Subject (plain text)") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "For " } });
    fireEvent.focus(subject);
    subject.setSelectionRange(4, 4);
    fireEvent.click(screen.getByRole("button", { name: "{{company}}" }));
    expect(subject.value).toBe("For {{company}}");
  });

  it("keeps an existing custom category selectable", () => {
    renderEditor(template({ category: "value_proposition" }));
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("value_proposition");
  });

  it("switching to HTML shows the code editor and a sandboxed live preview with sample values", () => {
    renderEditor(template());
    expect(screen.queryByTitle("Email preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "HTML design" }));
    const code = screen.getByLabelText("HTML code") as HTMLTextAreaElement;
    // The plain text moved over as paragraphs.
    expect(code.value).toBe("<p>Hi {{first_name|there}},</p>\n<p>Big news.</p>");
    expect(screen.getByText(/AI personalization applies to plain-text templates/)).toBeInTheDocument();

    fireEvent.change(code, {
      target: { value: '<p onclick="alert(1)">Hi {{first_name|there}} from {{my_company}} ({{offer}})</p><script>alert(1)</script>' },
    });
    const frame = iframe();
    expect(frame.getAttribute("sandbox")).toBe("");
    const doc = frame.getAttribute("srcdoc") ?? "";
    expect(doc).toContain("Hi Jordan from Northwind (20% off)");
    expect(doc).not.toMatch(/<script|onclick/);
  });

  it("toggles the preview between desktop and mobile width", () => {
    renderEditor(template({ format: "html", body: "<p>Hi</p>" }));
    expect(iframe().style.width).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "mobile" }));
    expect(iframe().style.width).toBe("375px");
  });

  it("saves the format with the template", async () => {
    const { onClose } = renderEditor(template({ format: "html", body: "<p>Hi</p>" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(templates.update).toHaveBeenCalledWith(5, expect.objectContaining({ format: "html", body: "<p>Hi</p>" })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("warns when a plain-text body looks like HTML", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Email body"), { target: { value: "<table><tr><td>x</td></tr></table>" } });
    expect(screen.getByText(/This looks like HTML/)).toBeInTheDocument();
  });

  describe("Generate with AI", () => {
    it("explains how to connect a provider when none is configured", async () => {
      ai.list.mockResolvedValue([provider({ configured: false, isDefault: false })]);
      renderEditor(template({ format: "html", body: "<p>Hi</p>" }));
      fireEvent.click(screen.getByRole("button", { name: /Generate with AI/ }));
      const link = await screen.findByRole("link", { name: /Settings → AI providers/ });
      expect(link).toHaveAttribute("href", "/settings");
      expect(screen.queryByRole("button", { name: "Generate design" })).not.toBeInTheDocument();
    });

    it("fills the editor with the generated design and the suggested subject", async () => {
      templates.generateHtml.mockResolvedValue({ html: "<html><body><p>Fresh {{company}}</p></body></html>", subject: "Spring news" });
      renderEditor(null);
      fireEvent.click(screen.getByRole("radio", { name: "HTML design" }));
      fireEvent.click(screen.getByRole("button", { name: /Generate with AI/ }));

      const description = await screen.findByLabelText("What should the email be about?");
      const generate = screen.getByRole("button", { name: "Generate design" });
      expect(generate).toBeDisabled();
      fireEvent.change(description, { target: { value: "A spring newsletter for our bakery customers" } });
      fireEvent.change(screen.getByLabelText("Brand color (optional)"), { target: { value: "#e11d48" } });
      fireEvent.click(generate);

      await waitFor(() =>
        expect(templates.generateHtml).toHaveBeenCalledWith({
          description: "A spring newsletter for our bakery customers",
          tone: "Professional",
          brandColor: "#e11d48",
          includeVariables: true,
          provider: null,
        }),
      );
      await waitFor(() => expect((screen.getByLabelText("HTML code") as HTMLTextAreaElement).value).toContain("Fresh {{company}}"));
      expect((screen.getByLabelText("Subject (plain text)") as HTMLInputElement).value).toBe("Spring news");
      expect(iframe().getAttribute("srcdoc")).toContain("Fresh Acme Co");
    });

    it("ignores a design that arrives after the dialog was closed", async () => {
      let resolve!: (v: { html: string; subject?: string }) => void;
      templates.generateHtml.mockReturnValue(new Promise((r) => { resolve = r; }));
      renderEditor(template({ format: "html", body: "<p>Mine</p>" }));
      fireEvent.click(screen.getByRole("button", { name: /Generate with AI/ }));
      fireEvent.change(await screen.findByLabelText("What should the email be about?"), {
        target: { value: "A product launch announcement" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
      await waitFor(() => expect(templates.generateHtml).toHaveBeenCalled());

      // Closing while the AI is working asks first.
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const dialogs = screen.getAllByRole("button", { name: "Close dialog" });
      fireEvent.click(dialogs[dialogs.length - 1]);
      expect(confirm).toHaveBeenCalledTimes(1);
      confirm.mockRestore();
      expect(screen.queryByLabelText("What should the email be about?")).not.toBeInTheDocument();

      resolve({ html: "<p>Late design</p>", subject: "Late" });
      await new Promise((r) => setTimeout(r, 0));
      expect((screen.getByLabelText("HTML code") as HTMLTextAreaElement).value).toBe("<p>Mine</p>");
    });

    it("shows the server's message when generation fails", async () => {
      templates.generateHtml.mockRejectedValue({ response: { status: 429, data: { message: "OpenAI is rate limiting your key" } } });
      renderEditor(template({ format: "html", body: "<p>Hi</p>" }));
      fireEvent.click(screen.getByRole("button", { name: /Generate with AI/ }));
      fireEvent.change(await screen.findByLabelText("What should the email be about?"), {
        target: { value: "A product launch announcement" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText("OpenAI is rate limiting your key")).toBeInTheDocument();
    });
  });

  it("asks before the backdrop or Escape throw away unsaved changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderEditor(template());
    const backdrop = screen.getByRole("dialog", { name: "Edit template" }).parentElement!;

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(confirm).not.toHaveBeenCalled(); // nothing changed yet
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Launch v2" } });
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
