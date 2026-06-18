import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { campaignService } from "./campaign.service.js";
import { setModeSchema } from "./campaign.schema.js";

export async function campaignController(app: FastifyInstance) {
  app.post("/start", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await campaignService.start()),
  );

  app.post("/pause", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await campaignService.pause()),
  );

  app.post("/resume", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await campaignService.resume()),
  );

  app.post("/stop", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await campaignService.stop()),
  );

  app.patch("/mode", { preHandler: authGuard }, async (req, reply) => {
    const { mode } = setModeSchema.parse(req.body);
    return reply.code(200).send(await campaignService.setMode(mode));
  });

  app.get("/status", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await campaignService.status()),
  );
}
