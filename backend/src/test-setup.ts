/**
 * Vitest global setup — runs before every test file in node environment.
 *
 * Sets the minimum required environment variables so the lazy env proxy
 * (src/config/env.ts) can resolve without a real .env file.  These are
 * test-only placeholders; no real secrets here.
 */
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // exactly 32 chars
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.JWT_SECRET = "test-jwt-secret-placeholder-0001";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-placeholder1";
