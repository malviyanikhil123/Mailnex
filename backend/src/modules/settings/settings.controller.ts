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

export async function settingsController(app: FastifyInstance) {
  /** GET /settings — public (secret-free) view. */
  app.get("/", { preHandler: authGuard }, async (_req, reply) => {
    return reply.code(200).send(await settingsService.getPublic());
  });

  /** PATCH /settings/gmail — store Gmail email + encrypted app password. */
  app.patch("/gmail", { preHandler: authGuard }, async (req, reply) => {
    const input = updateGmailSchema.parse(req.body);
    await settingsService.updateGmail(input);
    return reply.code(200).send({ updated: true });
  });

  /** PATCH /settings/gemini — store encrypted Gemini API key. */
  app.patch("/gemini", { preHandler: authGuard }, async (req, reply) => {
    const input = updateGeminiSchema.parse(req.body);
    await settingsService.updateGemini(input);
    return reply.code(200).send({ updated: true });
  });

  /** PATCH /settings/candidate — update candidate profile (merged). */
  app.patch("/candidate", { preHandler: authGuard }, async (req, reply) => {
    const input = candidateProfileSchema.parse(req.body);
    const merged = await settingsService.updateCandidate(input);
    return reply.code(200).send(merged);
  });

  /** PATCH /settings/campaign — mode/window/limit/testEmail/provider. */
  app.patch("/campaign", { preHandler: authGuard }, async (req, reply) => {
    const input = updateCampaignSchema.parse(req.body);
    const updated = await settingsService.updateCampaign(input);
    return reply.code(200).send(updated);
  });

  /** POST /settings/resume — upload resume; stored in UPLOAD_DIR, path saved. */
  app.post(
    "/resume",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }
      const ext = path.extname(data.filename) || ".pdf";
      const uploadDir = path.resolve(env.UPLOAD_DIR);
      await fs.mkdir(uploadDir, { recursive: true });
      const resumePath = path.join(uploadDir, `resume${ext}`);
      await pipeline(data.file, createWriteStream(resumePath));
      await settingsService.setResumePath(resumePath);
      return reply.code(200).send({ resumeFileName: path.basename(resumePath) });
    },
  );
}
