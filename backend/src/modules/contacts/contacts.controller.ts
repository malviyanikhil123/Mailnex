import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { authGuard } from "../../middleware/auth-guard.js";
import { contactsService, importProgress } from "./contacts.service.js";
import { contactsRepo } from "./contacts.repo.js";
import { listContactsQuerySchema, listImportsQuerySchema } from "./contacts.schema.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

// .xls (the pre-2007 binary format) cannot be read by ExcelJS.
const IMPORT_EXTENSIONS = [".xlsx", ".csv"];

/**
 * Users with an import being uploaded or processed. One at a time per user: each
 * import holds its parsed rows in memory until they are inserted.
 */
export const activeImports = new Set<number>();

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function contactsController(app: FastifyInstance) {
  app.post(
    "/import",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }

      const ext = path.extname(data.filename).toLowerCase();
      if (!IMPORT_EXTENSIONS.includes(ext)) {
        data.file.resume();
        return reply.code(400).send({ error: "Upload an .xlsx or .csv file" });
      }

      if (activeImports.has(userId)) {
        data.file.resume();
        return reply.code(409).send({ error: "An import is already running. Wait for it to finish." });
      }
      activeImports.add(userId);

      const jobId = crypto.randomUUID();
      let tmpPath = "";
      try {
        const uploadDir = path.resolve(env.UPLOAD_DIR, "tmp");
        await fs.mkdir(uploadDir, { recursive: true });
        tmpPath = path.join(uploadDir, `${jobId}${ext}`);
        await pipeline(data.file, createWriteStream(tmpPath));
      } catch (err) {
        activeImports.delete(userId);
        // e.g. the 20 MB upload limit: don't leave the partial file behind.
        if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
        throw err;
      }

      const fileName = data.filename;
      const rawName = (data.fields?.name as { value?: unknown } | undefined)?.value;
      const name = rawName ? String(rawName).slice(0, 120) : undefined;

      // Fire-and-forget: do not await. importFromFile records a failure on the job itself
      // (progress shows the error); the catch only keeps a rejection from going unhandled.
      contactsService
        .importFromFile(userId, tmpPath, fileName, jobId, name)
        .catch((err: unknown) => {
          logger.error({ err, jobId }, "Import failed");
        })
        .finally(() => activeImports.delete(userId));

      return reply.code(202).send({ jobId });
    },
  );

  app.get(
    "/import/:jobId/progress",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { jobId } = req.params as { jobId: string };
      const progress = importProgress.get(jobId);
      if (!progress) {
        return reply.code(404).send({ error: "Job not found" });
      }
      return reply.code(200).send(progress);
    },
  );

  app.get(
    "/imports",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const query = listImportsQuerySchema.parse(req.query);
      const result = await contactsRepo.listImports(userId, query);
      return reply.code(200).send(result);
    },
  );

  app.get(
    "/",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const query = listContactsQuerySchema.parse(req.query);
      const result = await contactsRepo.list(userId, query);
      return reply.code(200).send(result);
    },
  );

  app.get(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const contact = await contactsRepo.getById(userId, id);
      if (!contact) {
        return reply.code(404).send({ error: "Contact not found" });
      }
      return reply.code(200).send(contact);
    },
  );

  app.delete(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const deleted = await contactsRepo.delete(userId, id);
      if (!deleted) {
        return reply.code(404).send({ error: "Contact not found" });
      }
      return reply.code(200).send({ deleted: true });
    },
  );
}
