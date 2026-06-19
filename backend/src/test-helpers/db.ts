/**
 * DB integration test gate.
 *
 * Set RUN_DB_TESTS=1 (and valid DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD /
 * DB_DATABASE) before running to enable integration tests that require a real
 * PostgreSQL connection.
 *
 * Usage in test files:
 *   import { dbEnabled } from "../../test-helpers/db.js";
 *   describe.skipIf(!dbEnabled)("my integration suite", () => { ... });
 */
export const dbEnabled = !!process.env.RUN_DB_TESTS;
