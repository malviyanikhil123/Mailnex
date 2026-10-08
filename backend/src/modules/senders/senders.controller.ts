import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
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

  app.post("/", { preHandler: authGuard }, async (req, reply) => {
    const input = createSenderSchema.parse(req.body);
    return reply.code(201).send(await sendersService.create(getUserId(req), input));
  });

  app.patch("/:id", { preHandler: authGuard }, async (req, reply) => {
    const input = updateSenderSchema.parse(req.body);
    return reply.code(200).send(await sendersService.update(getUserId(req), getId(req), input));
  });

  app.delete("/:id", { preHandler: authGuard }, async (req, reply) => {
    await sendersService.remove(getUserId(req), getId(req));
    return reply.code(200).send({ deleted: true });
  });
}
