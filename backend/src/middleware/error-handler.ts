import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "ValidationError", details: err.flatten() });
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      logger.error({ err }, "unhandled error");
      return reply.code(status).send({ error: "InternalServerError", message: "Internal Server Error" });
    }
    reply.code(status).send({ error: err.name ?? "Error", message: err.message });
  });
}
