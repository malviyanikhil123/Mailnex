import "dotenv/config";
import { z } from "zod";

/** Placeholder secrets shipped in the repo; fine for local dev, never in production. */
export const DEV_SECRETS = {
  JWT_SECRET: "default-mailnex-jwt-secret-key-replace-in-prod",
  JWT_REFRESH_SECRET: "default-mailnex-refresh-secret-key-replace-in-prod",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
} as const;

const schema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_DATABASE: z.string().min(1),
  JWT_SECRET: z.string().min(1).default(DEV_SECRETS.JWT_SECRET),
  JWT_REFRESH_SECRET: z.string().min(1).default(DEV_SECRETS.JWT_REFRESH_SECRET),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY must be 32 chars").default(DEV_SECRETS.ENCRYPTION_KEY),
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
}).superRefine((e, ctx) => {
  // Anyone can read the repo defaults: with them, tokens can be forged for any user
  // and stored app passwords / API keys decrypted. Refuse to boot in production.
  if (e.NODE_ENV !== "production") return;
  for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"] as const) {
    if (e[key] === DEV_SECRETS[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} must be set to a private value in production` });
    }
  }
  for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET"] as const) {
    if (e[key].length < 32) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} must be at least 32 characters in production` });
    }
  }
  if (e.JWT_SECRET === e.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "JWT_REFRESH_SECRET must differ from JWT_SECRET" });
  }
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
