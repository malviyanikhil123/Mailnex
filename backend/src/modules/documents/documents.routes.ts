import type { FastifyInstance } from "fastify";
import { documentsController } from "./documents.controller.js";

export async function documentsRoutes(app: FastifyInstance) {
  await app.register(documentsController);
}
