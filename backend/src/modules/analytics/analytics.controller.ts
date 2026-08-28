import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authGuard } from "../../middleware/auth-guard.js";
import { analyticsService } from "./analytics.service.js";

const dailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(14),
});
const monthlyQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function analyticsController(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await analyticsService.dashboard(userId));
  });

  app.get("/daily", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const { days } = dailyQuerySchema.parse(req.query);
    return reply.code(200).send({ trends: await analyticsService.daily(userId, days) });
  });

  app.get("/monthly", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const { months } = monthlyQuerySchema.parse(req.query);
    return reply.code(200).send({ trends: await analyticsService.monthly(userId, months) });
  });
}
