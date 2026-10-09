import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DocumentList, UserDocument } from "../../types/api";
import { useToast } from "../../store/toast";

const api = {
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
};

vi.mock("../../services/settings.api", () => ({ settingsApi: api }));

const { DocumentsSection } = await import("./DocumentsSection");

const MB = 1024 * 1024;
const limits = {
  maxDocuments: 10,
  maxBytes: 5 * MB,
  extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "png", "jpg", "jpeg"],
};

function doc(id: number): UserDocument {
  return { id, name: `Doc ${id}`, fileName: `doc-${id}.pdf`, createdAt: "2026-01-01T00:00:00Z" };
}

function list(count: number): DocumentList {
  return { documents: Array.from({ length: count }, (_, i) => doc(i + 1)), limits };
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentsSection />
    </QueryClientProvider>,
  );
}

function pickFile(file: File) {
  fireEvent.change(screen.getByTestId("document-file"), { target: { files: [file] } });
}

function sizedFile(name: string, size: number): File {
  const file = new File(["%PDF-1.7"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const toastMessages = () => useToast.getState().toasts.map((t) => t.message);

describe("DocumentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToast.setState({ toasts: [] });
  });

  it("shows how many of the allowed documents are used and lists them", async () => {
    api.listDocuments.mockResolvedValue(list(3));
    renderSection();
    expect(await screen.findByText("3 / 10 used")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Doc 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Document name")).toBeEnabled();
    expect(screen.getByTestId("document-file")).toHaveAttribute("accept", limits.extensions.map((e) => `.${e}`).join(","));
  });

  it("blocks adding more once the limit is reached and says why", async () => {
    api.listDocuments.mockResolvedValue(list(10));
    renderSection();
    expect(await screen.findByText("10 / 10 used")).toBeInTheDocument();
    expect(screen.getByText(/reached the limit of 10 documents/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add document" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose file…" })).toBeDisabled();
  });

  it("refuses an oversized file before uploading", async () => {
    api.listDocuments.mockResolvedValue(list(0));
    renderSection();
    await screen.findByText("0 / 10 used");
    pickFile(sizedFile("huge.pdf", 7 * MB));
    expect(toastMessages()).toEqual(['"huge.pdf" is 7 MB. Documents can be up to 5 MB.']);
    expect(screen.getByRole("button", { name: "+ Add document" })).toBeDisabled();
  });

  it("refuses a file type the server does not accept", async () => {
    api.listDocuments.mockResolvedValue(list(0));
    renderSection();
    await screen.findByText("0 / 10 used");
    pickFile(sizedFile("setup.exe", 100));
    expect(toastMessages()[0]).toMatch(/"setup.exe" isn't a supported file type/);
    expect(screen.getByRole("button", { name: "+ Add document" })).toBeDisabled();
  });

  it("uploads the picked file with its name and shows the server's message on failure", async () => {
    api.listDocuments.mockResolvedValue(list(1));
    api.uploadDocument.mockRejectedValue({
      response: { status: 400, data: { message: "This file's content doesn't look like a .pdf file." } },
    });
    renderSection();
    await screen.findByText("1 / 10 used");

    fireEvent.change(screen.getByLabelText("Document name"), { target: { value: "Price list" } });
    const file = sizedFile("prices.pdf", 1000);
    pickFile(file);
    fireEvent.click(screen.getByRole("button", { name: "+ Add document" }));

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledWith(file, "Price list"));
    await waitFor(() => expect(toastMessages()).toContain("This file's content doesn't look like a .pdf file."));
  });
});
