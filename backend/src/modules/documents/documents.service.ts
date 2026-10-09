import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { env } from "../../config/env.js";
import { LIMITS } from "../../config/constants.js";
import { logger } from "../../utils/logger.js";
import { fileExtension, matchesFileSignature, sanitizeFileName } from "../../utils/file-upload.js";
import { documentsRepo, type DocumentRow, type IDocumentsRepo } from "./documents.repo.js";

const MAX_NAME_CHARS = 100;
const MAX_MB = LIMITS.DOCUMENT_MAX_BYTES / (1024 * 1024);

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export const fileTooLargeError = () =>
  httpError(413, `This file is too large. Documents can be up to ${MAX_MB} MB.`);

/** API view of a document — never exposes the server-side file path. */
export interface PublicDocument {
  id: number;
  name: string;
  fileName: string;
  createdAt: Date;
}

export interface DocumentLimits {
  maxDocuments: number;
  maxBytes: number;
  extensions: readonly string[];
}

export interface DocumentUpload {
  /** Label shown in the app; defaults to the file name without its extension. */
  name?: string;
  /** File name as sent by the browser (untrusted). */
  originalName: string;
  content: Buffer;
}

/** Where document bytes live. Stored names are random, so user input never reaches a path. */
export interface DocumentStorage {
  save(storedName: string, content: Buffer): Promise<string>;
  remove(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
}

export const diskStorage: DocumentStorage = {
  async save(storedName, content) {
    const dir = path.resolve(env.UPLOAD_DIR, "documents");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, storedName);
    await fs.writeFile(filePath, content, { flag: "wx" });
    return filePath;
  },
  async remove(filePath) {
    await fs.unlink(filePath).catch(() => {});
  },
  async exists(filePath) {
    return fs.access(filePath).then(() => true, () => false);
  },
};

function toPublic({ id, name, fileName, createdAt }: DocumentRow): PublicDocument {
  return { id, name, fileName, createdAt };
}

export class DocumentsService {
  constructor(
    private repo: IDocumentsRepo = documentsRepo,
    private storage: DocumentStorage = diskStorage,
  ) {}

  limits(): DocumentLimits {
    return {
      maxDocuments: LIMITS.DOCUMENTS_PER_USER,
      maxBytes: LIMITS.DOCUMENT_MAX_BYTES,
      extensions: LIMITS.DOCUMENT_EXTENSIONS,
    };
  }

  async list(userId: number): Promise<PublicDocument[]> {
    return (await this.repo.list(userId)).map(toPublic);
  }

  /** Validates and stores an upload: count limit (409), size (413), type and name (400). */
  async upload(userId: number, input: DocumentUpload): Promise<PublicDocument> {
    const max = LIMITS.DOCUMENTS_PER_USER;
    if ((await this.repo.count(userId)) >= max) throw this.fullError();

    const fileName = sanitizeFileName(input.originalName);
    const ext = fileExtension(fileName);
    if (!(LIMITS.DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
      throw httpError(400, `This file type isn't supported. Allowed: ${LIMITS.DOCUMENT_EXTENSIONS.join(", ")}.`);
    }
    if (input.content.length === 0) throw httpError(400, "This file is empty.");
    if (input.content.length > LIMITS.DOCUMENT_MAX_BYTES) throw fileTooLargeError();
    if (!matchesFileSignature(ext, input.content)) {
      throw httpError(400, `This file's content doesn't look like a .${ext} file.`);
    }

    const typed = (input.name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    const name = typed || fileName.slice(0, -(ext.length + 1)).slice(0, MAX_NAME_CHARS);
    if (name.length > MAX_NAME_CHARS) {
      throw httpError(400, `Document name must be at most ${MAX_NAME_CHARS} characters.`);
    }

    const filePath = await this.storage.save(`${randomUUID()}.${ext}`, input.content);
    const row = await this.repo.addWithinLimit(userId, { name, fileName, filePath }, max);
    if (!row) {
      await this.storage.remove(filePath);
      throw this.fullError();
    }
    return toPublic(row);
  }

  /** Deletes the document and its file. Templates that attached it send without an attachment. */
  async remove(userId: number, id: number): Promise<void> {
    const row = await this.repo.remove(userId, id);
    if (!row) throw httpError(404, "Document not found");
    await this.storage.remove(row.filePath);
  }

  /** The attachment for a template's document, or null when none is set or it is gone. */
  async getAttachment(
    userId: number,
    documentId?: number | null,
  ): Promise<{ filename: string; path: string } | null> {
    if (!documentId) return null;
    const doc = await this.repo.get(userId, documentId);
    if (!doc) return null;
    if (!(await this.storage.exists(doc.filePath))) {
      logger.warn({ userId, documentId }, "document file is missing on disk — sending without the attachment");
      return null;
    }
    return { filename: doc.fileName, path: doc.filePath };
  }

  private fullError() {
    return httpError(
      409,
      `You already have ${LIMITS.DOCUMENTS_PER_USER} documents, the maximum. Delete one to upload another.`,
    );
  }
}

export const documentsService = new DocumentsService();
