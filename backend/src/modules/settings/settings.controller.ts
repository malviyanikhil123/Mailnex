import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as fs from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { authGuard } from "../../middleware/auth-guard.js";
import { settingsService } from "./settings.service.js";
import { env } from "../../config/env.js";
import {
  updateGmailSchema,
  updateGeminiSchema,
  candidateProfileSchema,
  updateCampaignSchema,
} from "./settings.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function settingsController(app: FastifyInstance) {
  /** GET /settings — public (secret-free) view. */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await settingsService.getPublic(userId));
  });

  /** PATCH /settings/gmail — store Gmail email + encrypted app password. */
  app.patch("/gmail", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = updateGmailSchema.parse(req.body);
    await settingsService.updateGmail(userId, input);
    return reply.code(200).send({ updated: true });
  });

  /** PATCH /settings/gemini — store encrypted Gemini API key. */
  app.patch("/gemini", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = updateGeminiSchema.parse(req.body);
    await settingsService.updateGemini(userId, input);
    return reply.code(200).send({ updated: true });
  });

  /** PATCH /settings/candidate — update candidate profile (merged). */
  app.patch("/candidate", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = candidateProfileSchema.parse(req.body);
    const merged = await settingsService.updateCandidate(userId, input);
    return reply.code(200).send(merged);
  });

  /** PATCH /settings/campaign — mode/window/limit/testEmail/provider. */
  app.patch("/campaign", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = updateCampaignSchema.parse(req.body);
    const updated = await settingsService.updateCampaign(userId, input);
    return reply.code(200).send(updated);
  });

  /** GET /settings/resumes — list all uploaded resumes for user. */
  app.get("/resumes", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const resumes = await settingsService.listResumes(userId);
    return reply.code(200).send({ resumes });
  });

  /** POST /settings/resumes — upload a new named resume. */
  app.post(
    "/resumes",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }
      const rawName = (data.fields?.name as any)?.value;
      const fileName = data.filename;
      const name = rawName ? String(rawName).trim() : path.parse(fileName).name;
      const ext = path.extname(fileName) || ".pdf";
      const uploadDir = path.resolve(env.UPLOAD_DIR, "resumes");
      await fs.mkdir(uploadDir, { recursive: true });
      const uniqueId = (await import("crypto")).randomUUID();
      const resumePath = path.join(uploadDir, `resume_${userId}_${uniqueId}${ext}`);
      await pipeline(data.file, createWriteStream(resumePath));
      const resume = await settingsService.addResume(userId, name, fileName, resumePath);
      return reply.code(201).send(resume);
    },
  );

  /** DELETE /settings/resumes/:id — delete a specific resume. */
  app.delete(
    "/resumes/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const resumeId = parseInt(idStr, 10);
      if (isNaN(resumeId)) {
        return reply.code(400).send({ error: "Invalid resume ID" });
      }
      const deleted = await settingsService.deleteResume(userId, resumeId);
      if (!deleted) {
        return reply.code(404).send({ error: "Resume not found" });
      }
      if (deleted.filePath) {
        await fs.unlink(deleted.filePath).catch(() => {});
      }
      return reply.code(200).send({ deleted: true });
    },
  );

  /** POST /settings/resume — upload legacy default resume; stored in UPLOAD_DIR, path saved. */
  app.post(
    "/resume",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }
      const ext = path.extname(data.filename) || ".pdf";
      const uploadDir = path.resolve(env.UPLOAD_DIR);
      await fs.mkdir(uploadDir, { recursive: true });
      const resumePath = path.join(uploadDir, `resume_${userId}${ext}`);
      await pipeline(data.file, createWriteStream(resumePath));
      await settingsService.setResumePath(userId, resumePath);
      return reply.code(200).send({ resumeFileName: path.basename(resumePath) });
    },
  );
}
