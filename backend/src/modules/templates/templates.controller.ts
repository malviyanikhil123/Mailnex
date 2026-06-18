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

export async function templatesController(app: FastifyInstance) {
  /**
   * POST /templates
   * Create a new email template.
   */
  app.post(
    "/",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const input = createTemplateSchema.parse(req.body);
      try {
        const template = await templatesService.create(input);
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

  /**
   * GET /templates
   * List all email templates.
   */
  app.get(
    "/",
    { preHandler: authGuard },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const templates = await templatesService.list();
      return reply.code(200).send(templates);
    },
  );

  /**
   * GET /templates/:id
   * Get a single template by id.
   */
  app.get(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const template = await templatesService.get(id);
      return reply.code(200).send(template);
    },
  );

  /**
   * PUT /templates/:id
   * Update a template (version is automatically incremented).
   */
  app.put(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const data = updateTemplateSchema.parse(req.body);
      try {
        const updated = await templatesService.update(id, data);
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

  /**
   * DELETE /templates/:id
   * Remove a template.
   */
  app.delete(
    "/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      await templatesService.remove(id);
      return reply.code(200).send({ deleted: true });
    },
  );

  /**
   * POST /templates/:id/preview
   * Render a template with provided vars and return {subject, body}.
   */
  app.post(
    "/:id/preview",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id: idStr } = req.params as { id: string };
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const vars = previewVarsSchema.parse(req.body);
      const result = await templatesService.preview(id, vars);
      return reply.code(200).send(result);
    },
  );
}
