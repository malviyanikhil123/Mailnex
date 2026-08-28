import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_DATABASE: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY must be 32 chars"),
  GMAIL_EMAIL: z.string().optional().default(""),
  GMAIL_APP_PASSWORD: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("./uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TEST_EMAIL: z.string().optional().default(""),
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
