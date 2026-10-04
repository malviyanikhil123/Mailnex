import 'dotenv/config';
import { z } from 'zod';

const defaultDbUrl = process.env.DATABASE_URL
  || (process.env.DB_HOST
    ? `postgres://${encodeURIComponent(process.env.DB_USERNAME || '')}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || ''}`
    : '');

/** Every value the system needs. Secrets live only in .env, never in code or logs. */
const schema = z.object({
  DATABASE_URL: z.string().default(defaultDbUrl),
  WEB_PORT: z.coerce.number().default(5055),
  FRONT_PORT: z.coerce.number().default(5056),
  API_URL: z.string().optional(),
  GMAIL_EMAIL: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  IMAP_HOST: z.string().default('imap.gmail.com'),
  SCHEDULE_GAP_MINUTES: z.coerce.number().default(60),   // wait this long after one search ends
  JOB_MAX_AGE_DAYS: z.coerce.number().default(3),    // older adverts are usually already filled
  ENCRYPTION_KEY: z.string().min(16).optional(),   // seals other people's mailbox passwords
  JWT_SECRET: z.string().min(8).default(process.env.JWT_SECRET || 'default-secret-key-mailnex'),          // the same secret Mailnex signs with, so one login opens both apps
  IMAP_PORT: z.coerce.number().default(993),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().default('http://localhost:11434/v1'),   // a model running on this machine
  LLM_PRIMARY: z.string().default('google:gemini-2.0-flash'),
  LLM_FALLBACK: z.string().default('openrouter:meta-llama/llama-3.3-70b-instruct'),
  ALERT_EMAIL: z.string().email().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  JOOBLE_API_KEY: z.string().optional(),
  JOB_COUNTRIES: z.string().default('in,remote'),
  JOB_ROLES: z.string().default('business analyst'),
  CURRENT_EMPLOYER: z.string().optional(),
  ASK_THRESHOLD: z.coerce.number().default(60),
  AUTO_APPLY_THRESHOLD: z.coerce.number().default(80),
  // The unattended timetable, as ordinary cron lines. Three sweeps a day is enough:
  // job boards do not refresh faster than that, and hammering them gets us blocked.
  // Alert emails land all day long, so the mailbox is read far more often than the boards.
  // Normally blank. Set it to narrow the scheduled hunt to one source while testing,
  // the same way `pnpm run hunt remotive` does — leaving it set means a crippled hunt.
});

const parsed = schema.safeParse({
  ...process.env,
  DATABASE_URL: defaultDbUrl,
});
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Configuration problem in .env:\n${problems}`);
  process.exit(1);
}

export const env = parsed.data;

/** Blank values mean "this source is off", not "this crashed". */
export const has = {
  adzuna: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
  jooble: Boolean(env.JOOBLE_API_KEY),
  inbox: Boolean(env.GMAIL_EMAIL && env.GMAIL_APP_PASSWORD),
};

/** Roles to search for, read from the resume and confirmed by you. */
export const roles = env.JOB_ROLES.split(',').map((r) => r.trim()).filter(Boolean);

export const countries = env.JOB_COUNTRIES.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
