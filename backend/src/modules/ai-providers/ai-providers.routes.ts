import type { FastifyInstance } from "fastify";
import { aiProvidersController } from "./ai-providers.controller.js";

export async function aiProvidersRoutes(app: FastifyInstance) {
  await app.register(aiProvidersController);
}
