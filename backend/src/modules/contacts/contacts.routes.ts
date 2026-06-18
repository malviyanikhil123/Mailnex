import type { FastifyInstance } from "fastify";
import { contactsController } from "./contacts.controller.js";

export async function contactsRoutes(app: FastifyInstance) {
  await app.register(contactsController);
}
