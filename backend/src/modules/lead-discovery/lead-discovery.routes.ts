import type { FastifyInstance } from "fastify";
import { leadDiscoveryController } from "./lead-discovery.controller.js";

export async function leadDiscoveryRoutes(app: FastifyInstance) {
  await leadDiscoveryController(app);
}
