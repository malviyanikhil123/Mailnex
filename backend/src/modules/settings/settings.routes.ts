import type { FastifyInstance } from "fastify";
import { settingsController } from "./settings.controller.js";

export async function settingsRoutes(app: FastifyInstance) {
  await app.register(settingsController);
}
