import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { env, type Env } from "./config/env.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { clientKey } from "./middleware/rate-limit.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { contactsRoutes } from "./modules/contacts/contacts.routes.js";
import { templatesRoutes } from "./modules/templates/templates.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { documentsRoutes } from "./modules/documents/documents.routes.js";
import { campaignRoutes } from "./modules/campaign/campaign.routes.js";
import { sendersRoutes } from "./modules/senders/senders.routes.js";
import { logsRoutes } from "./modules/logs/logs.routes.js";
import { analyticsRoutes } from "./modules/analytics/analytics.routes.js";
import { inboxRoutes } from "./modules/inbox/inbox.routes.js";
import { aiProvidersRoutes } from "./modules/ai-providers/ai-providers.routes.js";

/** The settings buildApp reads at start-up; tests pass their own. */
export type AppOptions = Pick<Env, "TRUST_PROXY" | "CORS_ORIGINS">;

export async function buildApp(opts: AppOptions = { TRUST_PROXY: env.TRUST_PROXY, CORS_ORIGINS: env.CORS_ORIGINS }) {
  const app = Fastify({ logger: false, trustProxy: opts.TRUST_PROXY });

  await app.register(helmet, { contentSecurityPolicy: false });
  // With CORS_ORIGINS set only those origins get CORS headers; unset keeps reflecting
  // any origin so an existing deploy keeps working.
  await app.register(cors, {
    origin: opts.CORS_ORIGINS.length > 0 ? opts.CORS_ORIGINS : true,
    credentials: true,
  });
  // Per client; IPv6 clients by their /64 (see clientKey).
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute", keyGenerator: (req) => clientKey(req.ip) });
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
  await app.register(documentsRoutes, { prefix: "/settings/documents" });
  await app.register(campaignRoutes, { prefix: "/campaigns" });
  await app.register(sendersRoutes, { prefix: "/senders" });
  await app.register(logsRoutes, { prefix: "/logs" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  await app.register(inboxRoutes, { prefix: "/inbox" });
  await app.register(aiProvidersRoutes, { prefix: "/ai-providers" });
  return app;
}
