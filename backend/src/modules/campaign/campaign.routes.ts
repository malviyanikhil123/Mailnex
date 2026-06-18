import type { FastifyInstance } from "fastify";
import { campaignController } from "./campaign.controller.js";

export async function campaignRoutes(app: FastifyInstance) {
  await app.register(campaignController);
}
