/**
 * DB integration test gate.
 *
 * Set RUN_DB_TESTS=1 (and a valid DATABASE_URL) before running to enable
 * integration tests that require a real PostgreSQL connection.
 *
 * Usage in test files:
 *   import { dbEnabled } from "../../test-helpers/db.js";
 *   describe.skipIf(!dbEnabled)("my integration suite", () => { ... });
 */
export const dbEnabled = !!process.env.RUN_DB_TESTS;
