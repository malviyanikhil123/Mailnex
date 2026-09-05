import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { contactsRoutes } from "./modules/contacts/contacts.routes.js";
import { templatesRoutes } from "./modules/templates/templates.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { campaignRoutes } from "./modules/campaign/campaign.routes.js";
import { logsRoutes } from "./modules/logs/logs.routes.js";
import { analyticsRoutes } from "./modules/analytics/analytics.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try {
      const json = typeof body === "string" && body.trim() !== "" ? JSON.parse(body) : {};
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });
  registerErrorHandler(app);
  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(contactsRoutes, { prefix: "/contacts" });
  await app.register(templatesRoutes, { prefix: "/templates" });
  await app.register(settingsRoutes, { prefix: "/settings" });
  await app.register(campaignRoutes, { prefix: "/campaign" });
  await app.register(logsRoutes, { prefix: "/logs" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  return app;
}
