import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { Contact, ImportSummary } from "../types/api";
import { useToast } from "../store/toast";

const api = {
  list: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  imports: vi.fn(),
  listImports: vi.fn(),
  importFile: vi.fn(),
  progress: vi.fn(),
};

vi.mock("../services/contacts.api", () => ({ contactsApi: api }));

const { default: Contacts } = await import("./Contacts");

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 1, email: "ada@engines.io", firstName: "Ada", lastName: "Lovelace",
    companyName: "Analytical Engines", phone: "+44 20 1234", website: "engines.io",
    location: "London", contactPerson: null, customFields: { industry: "Computing" },
    importId: 7, status: "PENDING", retryCount: 0, nextRetryAt: null, lastContactedAt: null,
    sentAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
  };
}

function importRow(over: Partial<ImportSummary> = {}): ImportSummary {
  return {
    id: 7, name: "Bakeries", fileName: "bakeries.xlsx", totalRows: 12, importedRows: 10,
    skippedRows: 0, duplicateRows: 1, invalidRows: 1, customFieldKeys: ["industry"],
    createdAt: "2026-01-15T09:00:00Z", contactCount: 10, pendingCount: 4, ...over,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

function renderPage(url = "/contacts") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Contacts />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
  api.list.mockResolvedValue({ rows: [contact()], total: 1, page: 1, limit: 20 });
  api.imports.mockResolvedValue([importRow()]);
  api.listImports.mockResolvedValue({ imports: [importRow()], total: 1 });
});

describe("Contacts page", () => {
  it("opens on the Contacts tab with generic columns", async () => {
    renderPage();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true");
    for (const col of ["Name", "Email", "Company", "Phone", "Location", "Status", "Import"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    expect(screen.getByText("Analytical Engines")).toBeInTheDocument();
    expect(screen.getByText("+44 20 1234")).toBeInTheDocument();
    // The import column shows the import's name.
    expect(await screen.findByRole("cell", { name: "Bakeries" })).toBeInTheDocument();
    expect(api.listImports).not.toHaveBeenCalled();
  });

  it("falls back to the legacy contact person name", async () => {
    api.list.mockResolvedValue({
      rows: [contact({ firstName: null, lastName: null, contactPerson: "Grace Hopper", companyName: null, phone: null })],
      total: 1, page: 1, limit: 20,
    });
    renderPage();
    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
  });

  it("expands a row to show the custom fields as template variables", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Fields (2)" }));
    expect(screen.getByText("{{industry}}")).toBeInTheDocument();
    expect(screen.getByText("Computing")).toBeInTheDocument();
    expect(screen.getByText("{{contact_website}}")).toBeInTheDocument();
  });

  it("filters contacts by import from the URL", async () => {
    renderPage("/contacts?import=7");
    await screen.findByText("Ada Lovelace");
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ importId: 7, page: 1 }));
  });

  it("switches to the Imports tab and remembers it in the URL", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("tab", { name: "Imports" }));

    expect(await screen.findByText("bakeries.xlsx")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=imports");
    expect(screen.getByRole("tab", { name: "Imports" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the upload form, generic help and the import history on ?tab=imports", async () => {
    renderPage("/contacts?tab=imports");

    const row = (await screen.findByText("bakeries.xlsx")).closest("tr")!;
    expect(within(row).getByText("Bakeries")).toBeInTheDocument();
    expect(within(row).getByText("{{industry}}")).toBeInTheDocument();
    expect(within(row).getAllByText("10")).toHaveLength(2); // imported, contacts
    expect(within(row).getByText("4")).toBeInTheDocument(); // pending
    expect(api.listImports).toHaveBeenCalledWith({ search: undefined, sort: "newest", page: 1, limit: 10 });

    expect(screen.getByText(/Only an email column is\s+required/)).toBeInTheDocument();
    expect(screen.getByText("Company / Organization / Business")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    expect(screen.queryByText(/recruiter|hr email|job seeker/i)).not.toBeInTheDocument();
  });

  it("searches and sorts the import history", async () => {
    renderPage("/contacts?tab=imports");
    await screen.findByText("bakeries.xlsx");

    fireEvent.change(screen.getByPlaceholderText("Search import or file name…"), { target: { value: "bake" } });
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "oldest" } });

    await waitFor(() =>
      expect(api.listImports).toHaveBeenLastCalledWith({ search: "bake", sort: "oldest", page: 1, limit: 10 }),
    );
  });

  it("'View contacts' switches to the Contacts tab filtered by that import", async () => {
    renderPage("/contacts?tab=imports");
    fireEvent.click(await screen.findByRole("button", { name: "View contacts" }));

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?import=7");
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ importId: 7 }));
    await waitFor(() => expect(screen.getByLabelText("Import")).toHaveValue("7"));
  });

  it("uploads a named import and reports the summary", async () => {
    api.importFile.mockResolvedValue({ jobId: "job-1" });
    api.progress.mockResolvedValue({
      processed: 3, total: 3, done: true,
      summary: { total: 3, imported: 2, skipped: 0, duplicate: 1, invalid: 0 },
    });
    renderPage("/contacts?tab=imports");
    await screen.findByText("bakeries.xlsx");

    const file = new File(["email\na@x.io"], "people.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Import name"), { target: { value: "Gyms" } });
    fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(api.importFile).toHaveBeenCalledWith(file, "Gyms"));
    await waitFor(
      () => expect(useToast.getState().toasts.map((t) => t.message)).toContain("Imported 2 contacts (1 duplicates, 0 invalid)"),
      { timeout: 3000 },
    );
  });

  it("shows the error of a failed import", async () => {
    api.importFile.mockResolvedValue({ jobId: "job-2" });
    api.progress.mockResolvedValue({
      processed: 0, total: 0, done: true, error: "Could not read the file. Upload an .xlsx or .csv file.",
    });
    renderPage("/contacts?tab=imports");
    await screen.findByText("bakeries.xlsx");

    fireEvent.change(screen.getByLabelText("Spreadsheet file"), {
      target: { files: [new File(["x"], "broken.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(
      () => expect(useToast.getState().toasts.map((t) => t.message)).toContain(
        "Could not read the file. Upload an .xlsx or .csv file.",
      ),
      { timeout: 3000 },
    );
  });
});
