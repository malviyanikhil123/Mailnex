import type { FastifyInstance } from "fastify";
import { logsController } from "./logs.controller.js";

export async function logsRoutes(app: FastifyInstance) {
  await app.register(logsController);
}
