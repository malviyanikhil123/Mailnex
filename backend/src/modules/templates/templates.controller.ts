import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { templatesService } from "./templates.service.js";
import {
  createTemplateSchema,
  updateTemplateSchema,
  previewVarsSchema,
} from "./templates.schema.js";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function templatesController(app: FastifyInstance) {
  app.post(
    "/",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const input = createTemplateSchema.parse(req.body);
      try {
        const template = await templatesService.create(userId, input);
        return reply.code(201).send(template);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({
            error: "Conflict",
            message: "A template with this name and category already exists",
          });
        }
        throw err;
      }
    },
  );

  app.get(
    "/",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const templates = await templatesService.list(userId);
      return reply.code(200).send(templates);
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
      const template = await templatesService.get(userId, id);
      return reply.code(200).send(template);
    },
  );

  app.put(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const data = updateTemplateSchema.parse(req.body);
      try {
        const updated = await templatesService.update(userId, id, data);
        return reply.code(200).send(updated);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({
            error: "Conflict",
            message: "A template with this name and category already exists",
          });
        }
        throw err;
      }
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
      await templatesService.remove(userId, id);
      return reply.code(200).send({ deleted: true });
    },
  );

  app.post(
    "/:id/preview",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const vars = previewVarsSchema.parse(req.body);
      const result = await templatesService.preview(userId, id, vars);
      return reply.code(200).send(result);
    },
  );
}
