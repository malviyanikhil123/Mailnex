import type { FastifyInstance } from "fastify";
import { analyticsController } from "./analytics.controller.js";

export async function analyticsRoutes(app: FastifyInstance) {
  await app.register(analyticsController);
}
