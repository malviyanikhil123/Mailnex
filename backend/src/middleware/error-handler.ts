import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError, defaultErrorMap } from "zod";
import { logger } from "../utils/logger.js";

/**
 * First issue as one line for a toast. A message written for the user ("This key is
 * already a built-in variable") is shown as it is. Zod's own generic messages get the
 * field name in front ("email: Required"), so the toast still says what is missing —
 * the field only, never the raw path ("fields.0.key").
 */
export function zodErrorMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request";
  const generic = issue.message === defaultErrorMap(issue, { defaultError: issue.message, data: undefined }).message;
  const field = [...issue.path].reverse().find((p): p is string => typeof p === "string");
  return generic && field ? `${field}: ${issue.message}` : issue.message;
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
