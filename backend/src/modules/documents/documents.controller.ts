import type { FastifyInstance, FastifyRequest } from "fastify";
import type { MultipartFields } from "@fastify/multipart";
import { authGuard } from "../../middleware/auth-guard.js";
import { LIMITS } from "../../config/constants.js";
import { documentsService, fileTooLargeError } from "./documents.service.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error("Invalid document id"), { statusCode: 400 });
  return id;
}

function textField(fields: MultipartFields, key: string): string | undefined {
  const part = fields[key];
  const first = Array.isArray(part) ? part[0] : part;
  return first?.type === "field" ? String(first.value) : undefined;
}

export async function documentsController(app: FastifyInstance) {
  /** GET /settings/documents — the user's documents plus the upload limits. */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const documents = await documentsService.list(userId);
    return reply.code(200).send({ documents, limits: documentsService.limits() });
  });

  /** POST /settings/documents — multipart upload: optional "name" field, then "file". */
  app.post("/", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const data = await req.file({ limits: { fileSize: LIMITS.DOCUMENT_MAX_BYTES, files: 1 } });
    if (!data) return reply.code(400).send({ error: "BadRequest", message: "Choose a file to upload." });
    let content: Buffer;
    try {
      content = await data.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") throw fileTooLargeError();
      throw err;
    }
    // toBuffer() can miss the limit when the cut falls exactly on a chunk boundary and
    // return the first DOCUMENT_MAX_BYTES bytes; busboy still flags the stream as truncated.
    if (data.file.truncated) throw fileTooLargeError();
    const doc = await documentsService.upload(userId, {
      name: textField(data.fields, "name"),
      originalName: data.filename,
      content,
    });
    return reply.code(201).send(doc);
  });

  /** DELETE /settings/documents/:id — templates that attached it stop attaching. */
  app.delete("/:id", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const id = parseId((req.params as { id: string }).id);
    await documentsService.remove(userId, id);
    return reply.code(200).send({ deleted: true });
  });
}
