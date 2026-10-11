import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_DATABASE: z.string().min(1),
  JWT_SECRET: z.string().min(1).default("default-mailnex-jwt-secret-key-replace-in-prod"),
  JWT_REFRESH_SECRET: z.string().min(1).default("default-mailnex-refresh-secret-key-replace-in-prod"),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY must be 32 chars").default("0123456789abcdef0123456789abcdef"),
  GMAIL_EMAIL: z.string().optional().default(""),
  GMAIL_APP_PASSWORD: z.string().optional().default(""),
  PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("./uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TEST_EMAIL: z.string().optional().default(""),
  /** "1" runs the API without the send/inbox scheduler, e.g. a local UI pointed at a shared DB. */
  DISABLE_SCHEDULER: z.enum(["0", "1"]).default("0"),
  /**
   * Fastify's trustProxy: "true" trusts every X-Forwarded-For hop, a number trusts that
   * many hops (1 = one reverse proxy, e.g. nginx). Off by default, so req.ip — which
   * the rate limits key on — cannot be spoofed with a header when nothing sits in front.
   */
  TRUST_PROXY: z
    .string()
    .trim()
    .toLowerCase()
    .default("false")
    .refine((v) => /^(true|false|\d+)?$/.test(v), 'TRUST_PROXY must be "true", "false" or a hop count')
    .transform((v): boolean | number => (v === "true" ? true : /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : false)),
  /**
   * Comma-separated origins allowed to call the API with credentials, e.g.
   * "https://app.example.com,http://localhost:5173". Unset = any origin (the old default).
   */
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean)),
});
export type Env = z.infer<typeof schema>;
export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env { return schema.parse(src); }

// Lazy singleton — resolved on first access so test files that only import
// `loadEnv` do not trigger a parse of process.env at module load time.
let _env: Env | undefined;
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    if (!_env) _env = loadEnv();
    return (_env as Record<string | symbol, unknown>)[prop];
  },
  has(_target, prop) {
    if (!_env) _env = loadEnv();
    return prop in (_env as object);
  },
});
