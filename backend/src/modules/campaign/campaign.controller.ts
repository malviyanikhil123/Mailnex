import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { campaignService } from "./campaign.service.js";
import { createCampaignSchema, updateCampaignSchema } from "./campaign.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

function getId(req: FastifyRequest): number {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) throw Object.assign(new Error("Invalid id"), { statusCode: 400 });
  return id;
}

export async function campaignController(app: FastifyInstance) {
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send({ campaigns: await campaignService.list(getUserId(req)) });
  });

  app.post("/", { preHandler: authGuard }, async (req, reply) => {
    const input = createCampaignSchema.parse(req.body);
    return reply.code(201).send(await campaignService.create(getUserId(req), input));
  });

  app.get("/:id", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await campaignService.get(getUserId(req), getId(req)));
  });

  app.patch("/:id", { preHandler: authGuard }, async (req, reply) => {
    const input = updateCampaignSchema.parse(req.body);
    return reply.code(200).send(await campaignService.update(getUserId(req), getId(req), input));
  });

  app.delete("/:id", { preHandler: authGuard }, async (req, reply) => {
    await campaignService.remove(getUserId(req), getId(req));
    return reply.code(200).send({ deleted: true });
  });

  app.post("/:id/start", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await campaignService.start(getUserId(req), getId(req)));
  });

  app.post("/:id/pause", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await campaignService.pause(getUserId(req), getId(req)));
  });

  app.post("/:id/resume", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await campaignService.resume(getUserId(req), getId(req)));
  });

  app.post("/:id/stop", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await campaignService.stop(getUserId(req), getId(req)));
  });
}
