import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startScheduler } from "./scheduler/index.js";

// Start Mailnex Backend Server & Scheduler
const app = await buildApp();
startScheduler();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info(`[Mailnex API] listening on port ${env.PORT}`);

