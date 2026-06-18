import type { FastifyInstance } from "fastify";
import { templatesController } from "./templates.controller.js";

export async function templatesRoutes(app: FastifyInstance) {
  await app.register(templatesController);
}
