import type { FastifyInstance } from "fastify";
import { inboxController } from "./inbox.controller.js";

export async function inboxRoutes(app: FastifyInstance) {
  await app.register(inboxController);
}
