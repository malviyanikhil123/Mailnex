import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { authGuard } from "../../middleware/auth-guard.js";
import { contactsService, importProgress } from "./contacts.service.js";
import { contactsRepo } from "./contacts.repo.js";
import { listContactsQuerySchema } from "./contacts.schema.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

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

      const uploadDir = path.resolve(env.UPLOAD_DIR, "tmp");
      await fs.mkdir(uploadDir, { recursive: true });

      const jobId = crypto.randomUUID();
      const ext = path.extname(data.filename) || ".xlsx";
      const tmpPath = path.join(uploadDir, `${jobId}${ext}`);

      await pipeline(data.file, createWriteStream(tmpPath));

      const fileName = data.filename;

      // Fire-and-forget: do not await
      contactsService.importFromFile(userId, tmpPath, fileName, jobId).catch((err: unknown) => {
        logger.error({ err, jobId }, "Import failed");
      });

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
      const imports = await contactsRepo.listImports(userId);
      return reply.code(200).send({ imports });
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
