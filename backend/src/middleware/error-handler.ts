import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

/** First issue as one line, prefixed with its field ("email: Enter a valid email") so a
 *  bare "Required" in a toast still says what is missing. */
export function zodErrorMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      // `message` carries the first issue for toasts; `details` has them all.
      return reply.code(400).send({ error: "ValidationError", message: zodErrorMessage(err), details: err.flatten() });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      logger.error({ err }, "unhandled error");
      // An upstream failure (e.g. an AI provider that cannot be reached) is marked
      // `expose` because its message is written for the user.
      if ((err as { expose?: boolean }).expose) return reply.code(status).send({ error: "UpstreamError", message: err.message });
      return reply.code(status).send({ error: "InternalServerError", message: "Internal Server Error" });
    }
    reply.code(status).send({ error: err.name ?? "Error", message: err.message });
  });
}
