import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../../middleware/auth-guard.js";
import { analyticsService } from "./analytics.service.js";

const dailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(14),
});
const monthlyQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

export async function analyticsController(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: authGuard }, async (_req, reply) =>
    reply.code(200).send(await analyticsService.dashboard()),
  );

  app.get("/daily", { preHandler: authGuard }, async (req, reply) => {
    const { days } = dailyQuerySchema.parse(req.query);
    return reply.code(200).send({ trends: await analyticsService.daily(days) });
  });

  app.get("/monthly", { preHandler: authGuard }, async (req, reply) => {
    const { months } = monthlyQuerySchema.parse(req.query);
    return reply.code(200).send({ trends: await analyticsService.monthly(months) });
  });
}
