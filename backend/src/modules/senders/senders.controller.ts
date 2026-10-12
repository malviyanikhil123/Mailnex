import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { perUserRateLimit } from "../../middleware/rate-limit.js";
import { sendersService } from "./senders.service.js";
import { createSenderSchema, updateSenderSchema } from "./senders.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

function getId(req: FastifyRequest): number {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) throw Object.assign(new Error("Invalid id"), { statusCode: 400 });
  return id;
}

export async function sendersController(app: FastifyInstance) {
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send({ senders: await sendersService.list(getUserId(req)) });
  });

  // Create and update log in to Gmail with the submitted app password, so both are
  // limited per user to keep them from being used to test passwords.
  app.post("/", {
    preHandler: authGuard,
    config: { rateLimit: perUserRateLimit("senders-save") },
  }, async (req, reply) => {
    const input = createSenderSchema.parse(req.body);
    return reply.code(201).send(await sendersService.create(getUserId(req), input));
  });

  app.patch("/:id", {
    preHandler: authGuard,
    config: { rateLimit: perUserRateLimit("senders-save") },
  }, async (req, reply) => {
    const input = updateSenderSchema.parse(req.body);
    return reply.code(200).send(await sendersService.update(getUserId(req), getId(req), input));
  });

  app.delete("/:id", { preHandler: authGuard }, async (req, reply) => {
    await sendersService.remove(getUserId(req), getId(req));
    return reply.code(200).send({ deleted: true });
  });
}
