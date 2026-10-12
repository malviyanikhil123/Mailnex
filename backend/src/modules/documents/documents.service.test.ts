import { describe, it, expect, beforeEach } from "vitest";
import { DocumentsService, type DocumentStorage } from "./documents.service.js";
import type { DocumentRow, IDocumentsRepo } from "./documents.repo.js";
import { LIMITS } from "../../config/constants.js";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");

/** In-memory repo + storage so the service's rules can be checked without a DB or disk. */
function makeFakes() {
  let nextId = 1;
  const rows: DocumentRow[] = [];
  const files = new Map<string, Buffer>();

  const repo: IDocumentsRepo = {
    async list(userId) {
      return rows.filter((r) => r.userId === userId);
    },
    async count(userId) {
      return rows.filter((r) => r.userId === userId).length;
    },
    async get(userId, id) {
      return rows.find((r) => r.userId === userId && r.id === id) ?? null;
    },
    async addWithinLimit(userId, doc, max) {
      if (rows.filter((r) => r.userId === userId).length >= max) return null;
      const row = { ...doc, id: nextId++, userId, createdAt: new Date() };
      rows.push(row);
      return row;
    },
    async remove(userId, id) {
      const i = rows.findIndex((r) => r.userId === userId && r.id === id);
      return i === -1 ? null : rows.splice(i, 1)[0];
    },
  };

  const storage: DocumentStorage = {
    async save(storedName, content) {
      const filePath = `/uploads/documents/${storedName}`;
      files.set(filePath, content);
      return filePath;
    },
    async remove(filePath) {
      files.delete(filePath);
    },
    async exists(filePath) {
      return files.has(filePath);
    },
  };

  return { repo, storage, rows, files };
}

describe("DocumentsService", () => {
  let fakes: ReturnType<typeof makeFakes>;
  let service: DocumentsService;
  const userId = 1;

  beforeEach(() => {
    fakes = makeFakes();
    service = new DocumentsService(fakes.repo, fakes.storage);
  });

  it("stores a valid upload under a random name and keeps the sanitized original name", async () => {
    const doc = await service.upload(userId, { name: "  2026 prices ", originalName: "../Price list.pdf", content: PDF });
    expect(doc).toEqual({ id: 1, name: "2026 prices", fileName: "Price list.pdf", createdAt: expect.any(Date) });
    expect(doc).not.toHaveProperty("filePath");

    const [row] = fakes.rows;
    expect(row.filePath).toMatch(/^\/uploads\/documents\/[0-9a-f-]{36}\.pdf$/);
    expect(fakes.files.get(row.filePath)).toEqual(PDF);
  });

  it("names the document after the file when no name is given", async () => {
    const doc = await service.upload(userId, { originalName: "Company brochure.PDF", content: PDF });
    expect(doc.name).toBe("Company brochure");
    expect(doc.fileName).toBe("Company brochure.PDF");
  });

  it("rejects file types outside the allowed list with 400", async () => {
    await expect(
      service.upload(userId, { originalName: "setup.exe", content: Buffer.from("MZ\x90\x00") }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/isn't supported/) });
    await expect(service.upload(userId, { originalName: "noextension", content: PDF })).rejects.toMatchObject({ statusCode: 400 });
    expect(fakes.files.size).toBe(0);
  });

  it("rejects content that does not match the extension with 400", async () => {
    await expect(
      service.upload(userId, { originalName: "invoice.pdf", content: Buffer.from("MZ\x90\x00\x03") }),
    ).rejects.toMatchObject({ statusCode: 400, message: "This file's content doesn't look like a .pdf file." });
    expect(fakes.files.size).toBe(0);
  });

  it("rejects empty files with 400 and files over the size limit with 413", async () => {
    await expect(service.upload(userId, { originalName: "a.txt", content: Buffer.alloc(0) })).rejects.toMatchObject({ statusCode: 400 });
    const big = Buffer.concat([PDF, Buffer.alloc(LIMITS.DOCUMENT_MAX_BYTES)]);
    await expect(service.upload(userId, { originalName: "big.pdf", content: big })).rejects.toMatchObject({
      statusCode: 413,
      message: "This file is too large. Documents can be up to 5 MB.",
    });
  });

  it("rejects a document name longer than 100 characters with 400", async () => {
    await expect(
      service.upload(userId, { name: "x".repeat(101), originalName: "a.pdf", content: PDF }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks the upload with 409 once the user has the maximum number of documents", async () => {
    for (let i = 0; i < LIMITS.DOCUMENTS_PER_USER; i++) {
      await service.upload(userId, { originalName: `doc${i}.pdf`, content: PDF });
    }
    await expect(service.upload(userId, { originalName: "one-more.pdf", content: PDF })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("10 documents"),
    });
    expect(fakes.files.size).toBe(LIMITS.DOCUMENTS_PER_USER);
    // Another user is unaffected.
    await expect(service.upload(2, { originalName: "mine.pdf", content: PDF })).resolves.toMatchObject({ name: "mine" });
  });

  it("removes the stored file when a concurrent upload filled the last slot", async () => {
    fakes.repo.addWithinLimit = async () => null;
    await expect(service.upload(userId, { originalName: "late.pdf", content: PDF })).rejects.toMatchObject({ statusCode: 409 });
    expect(fakes.files.size).toBe(0);
  });

  it("removes the stored file when saving the row fails", async () => {
    fakes.repo.addWithinLimit = async () => {
      throw new Error("db down");
    };
    await expect(service.upload(userId, { originalName: "a.pdf", content: PDF })).rejects.toThrow("db down");
    expect(fakes.files.size).toBe(0);
  });

  it("lists only the user's documents, without server paths", async () => {
    await service.upload(userId, { originalName: "a.pdf", content: PDF });
    await service.upload(2, { originalName: "b.pdf", content: PDF });
    const list = await service.list(userId);
    expect(list.map((d) => d.fileName)).toEqual(["a.pdf"]);
    expect(list[0]).not.toHaveProperty("filePath");
  });

  it("remove deletes the row and the file, and 404s for someone else's document", async () => {
    const doc = await service.upload(userId, { originalName: "a.pdf", content: PDF });
    await expect(service.remove(2, doc.id)).rejects.toMatchObject({ statusCode: 404 });
    await service.remove(userId, doc.id);
    expect(fakes.rows).toHaveLength(0);
    expect(fakes.files.size).toBe(0);
  });

  it("getAttachment returns the file for the template's document", async () => {
    const doc = await service.upload(userId, { originalName: "Price list.pdf", content: PDF });
    expect(await service.getAttachment(userId, doc.id)).toEqual({
      filename: "Price list.pdf",
      path: fakes.rows[0].filePath,
    });
  });

  it("getAttachment returns null when there is no document, it was deleted, it is another user's, or the file is gone", async () => {
    const doc = await service.upload(userId, { originalName: "a.pdf", content: PDF });
    expect(await service.getAttachment(userId, null)).toBeNull();
    expect(await service.getAttachment(userId, undefined)).toBeNull();
    expect(await service.getAttachment(2, doc.id)).toBeNull();

    fakes.files.clear();
    expect(await service.getAttachment(userId, doc.id)).toBeNull();

    await service.remove(userId, doc.id);
    expect(await service.getAttachment(userId, doc.id)).toBeNull();
  });

  it("limits() reports the configured limits for the UI", () => {
    expect(service.limits()).toEqual({
      maxDocuments: 10,
      maxBytes: 5 * 1024 * 1024,
      extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "png", "jpg", "jpeg"],
    });
  });
});
