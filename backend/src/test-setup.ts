/**
 * Vitest global setup — runs before every test file in node environment.
 *
 * Sets the minimum required environment variables so the lazy env proxy
 * (src/config/env.ts) can resolve without a real .env file.  These are
 * test-only placeholders; no real secrets here.
 */
import "dotenv/config";

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"; // exactly 32 chars
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "5432";
process.env.DB_USERNAME = process.env.DB_USERNAME || "postgres";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "postgres";
process.env.DB_DATABASE = process.env.DB_DATABASE || "email_automation_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-placeholder-0001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret-placeholder1";
