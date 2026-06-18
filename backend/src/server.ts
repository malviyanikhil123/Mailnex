import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
// TODO(Phase 10): enable scheduler
// import { startScheduler } from "./scheduler/index.js"; // added Phase 7

const app = await buildApp();
// TODO(Phase 10): enable scheduler
// startScheduler();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info(`listening on ${env.PORT}`);
