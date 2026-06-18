import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startScheduler } from "./scheduler/index.js";

const app = await buildApp();
startScheduler();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info(`listening on ${env.PORT}`);
