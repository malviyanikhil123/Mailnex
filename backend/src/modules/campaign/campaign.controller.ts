import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { campaignService } from "./campaign.service.js";
import { setModeSchema } from "./campaign.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function campaignController(app: FastifyInstance) {
  app.post("/start", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await campaignService.start(userId));
  });

  app.post("/pause", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await campaignService.pause(userId));
  });

  app.post("/resume", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await campaignService.resume(userId));
  });

  app.post("/stop", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await campaignService.stop(userId));
  });

  app.patch("/mode", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const { mode } = setModeSchema.parse(req.body);
    return reply.code(200).send(await campaignService.setMode(userId, mode));
  });

  app.get("/status", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await campaignService.status(userId));
  });
}
