import type { FastifyInstance } from "fastify";
import { sendersController } from "./senders.controller.js";

export async function sendersRoutes(app: FastifyInstance) {
  await app.register(sendersController);
}
