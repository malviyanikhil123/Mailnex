import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startScheduler } from "./scheduler/index.js";

// Start Unified Mailnex + Job Autopilot Backend Server & Scheduler
const app = await buildApp();
startScheduler();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info(`[Mailnex + Job Autopilot API] listening on unified port ${env.PORT}`);

