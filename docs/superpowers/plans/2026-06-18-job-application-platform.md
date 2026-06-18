# Automated Job Application Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready monorepo that imports 23,800+ recruiter contacts from Excel and automatically sends Gemini-personalized job-application emails (≤50/day, 09:00–18:00, human-like intervals) from one Gmail account, managed through a React dashboard.

**Architecture:** Fastify + TypeScript backend in clean layered architecture (routes → controllers → services → repositories → Drizzle), with node-cron scheduling off a persistent `campaign_queue`, an `EmailProvider` abstraction over Gmail SMTP, and Gemini used only to personalize stored templates (template fallback on failure). React + Vite + Tailwind frontend consumes the API via Axios/React Query with JWT + rotating refresh tokens.

**Tech Stack:** Backend — Node 20, TypeScript, Fastify 4, Drizzle ORM, PostgreSQL 16, Nodemailer, @google/generative-ai, ExcelJS, node-cron, Zod, Pino, bcrypt, jsonwebtoken, @fastify/{helmet,cors,rate-limit,jwt,multipart}, Vitest. Frontend — React 18, TypeScript, Vite, Tailwind, React Query, Axios, React Hook Form, Zod, Recharts, Zustand, Vitest + Testing Library.

## Global Constraints

- **Node 20+, TypeScript strict mode** in both apps (`"strict": true`).
- **Daily limit = 50 emails**; **window 09:00–18:00** (`startHour=9`, `endHour=18`); one email at a time, never simultaneous.
- **Retry schedule (temporary failures only):** retry 1 → +1h, retry 2 → +6h, retry 3 → +24h; after 3 → `FAILED`.
- **Permanent failures → `BOUNCED`, never retried, excluded from selection.**
- **Gmail daily-limit error → auto-pause campaign**, do not change contact status, resume next day.
- **Gemini fallback:** missing key / quota / unavailable → interpolate template, `aiUsed=false`, send proceeds.
- **Gemini never writes whole emails** — only personalizes greeting, opening paragraph, subject, slight wording.
- **Contact statuses:** `PENDING, PROCESSING, SENT, FAILED, BOUNCED, PAUSED`. **Campaign modes:** `DRAFT, TEST, LIVE`.
- **Secrets (Gmail app password, Gemini key) encrypted at rest (AES-256-GCM via `ENCRYPTION_KEY`)**, write-only over API.
- **All sending goes through `EmailProvider`** — no module imports Gmail/Nodemailer directly except `GmailProvider`.
- **Repositories are the only layer that touches Drizzle.**
- **Every API input validated with Zod.** Frequent commits, one per task minimum.
- **Candidate PII is seeded as placeholders** and edited via Settings UI — never hardcoded in source.

---

## File Structure

### Backend (`backend/src/`)
```
config/env.ts                 Zod-validated env loader
config/constants.ts           limits, retry schedule, enums-as-const
db/index.ts                   drizzle client + pool
db/schema/*.ts                one file per table group + enums.ts + index.ts
db/migrations/                drizzle-kit output
db/seed/{templates,admin,settings}.ts + seed.ts
utils/crypto.ts               AES-256-GCM encrypt/decrypt
utils/logger.ts               pino instance
utils/email-validator.ts      RFC-ish email check
utils/schedule.ts             random human-like time generation
middleware/error-handler.ts   Fastify setErrorHandler
middleware/auth-guard.ts      JWT preHandler
integrations/email/provider.ts        EmailProvider interface + types
integrations/email/gmail-provider.ts  Nodemailer Gmail impl
integrations/email/factory.ts         provider selection by app_settings
integrations/email/classify-failure.ts TEMPORARY/PERMANENT classifier
integrations/gemini/client.ts          Gemini adapter + fallback
integrations/excel/parser.ts           streaming ExcelJS row reader
modules/<feature>/<feature>.{routes,controller,service,repo,schema}.ts
scheduler/index.ts            registers cron
scheduler/tick.ts             per-minute campaign tick
jobs/generate-queue.ts        daily queue builder
jobs/send-email.ts            personalize+send+log+classify one email
app.ts                        builds Fastify instance + plugins
server.ts                     boot: migrate-check, start scheduler, listen
```

### Frontend (`frontend/src/`)
```
main.tsx, App.tsx
routes/index.tsx, routes/ProtectedRoute.tsx
store/auth.ts, store/theme.ts            zustand
services/client.ts                       axios + refresh interceptor
services/{auth,contacts,templates,campaign,logs,analytics,settings}.api.ts
hooks/use-*.ts                           react-query hooks per domain
layouts/AppLayout.tsx, layouts/AuthLayout.tsx
components/ui/* (Button, Card, Table, Input, Modal, Toast, Spinner, StatusBadge)
components/charts/* (LineTrend, RatePie)
pages/{Login,Dashboard,Contacts,Templates,Campaign,Logs,Analytics,Settings}.tsx
utils/format.ts, types/*.ts
```

---

# PHASE 0 — Monorepo & Tooling

### Task 0.1: Repo scaffold + backend project init

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`, `backend/vitest.config.ts`, `backend/.gitignore`
- Create: `README.md` (root, stub)

**Produces:** runnable `npm run` scripts (`dev`, `build`, `test`, `db:generate`, `db:migrate`, `db:seed`) and a compiling empty TS project.

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "job-app-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed/seed.ts"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/multipart": "^8.3.0",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4",
    "zod": "^3.23.8",
    "pino": "^9.3.2",
    "pino-pretty": "^11.2.2",
    "bcryptjs": "^2.4.3",
    "nodemailer": "^6.9.14",
    "@google/generative-ai": "^0.17.1",
    "exceljs": "^4.4.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.5",
    "vitest": "^2.0.5",
    "drizzle-kit": "^0.24.0",
    "@types/node": "^20.14.15",
    "@types/bcryptjs": "^2.4.6",
    "@types/nodemailer": "^6.4.15",
    "@types/node-cron": "^3.0.11"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node" } });
```

- [ ] **Step 4: Create `backend/.env.example`**

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jobapp
JWT_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
GMAIL_EMAIL=
GMAIL_APP_PASSWORD=
GEMINI_API_KEY=
PORT=4000
UPLOAD_DIR=./uploads
NODE_ENV=development
TEST_EMAIL=
```

- [ ] **Step 5: Install deps & verify TS compiles**

Run: `cd backend && npm install && npx tsc --noEmit`
Expected: install succeeds; `tsc` exits 0 (no src files yet).

- [ ] **Step 6: Commit**

```bash
git add backend README.md && git commit -m "chore: scaffold backend project"
```

### Task 0.2: Config + logger + constants

**Files:**
- Create: `backend/src/config/env.ts`, `backend/src/config/constants.ts`, `backend/src/utils/logger.ts`
- Test: `backend/src/config/env.test.ts`

**Interfaces:**
- Produces: `env` (validated object: `DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, GMAIL_EMAIL, GMAIL_APP_PASSWORD, GEMINI_API_KEY, PORT:number, UPLOAD_DIR, NODE_ENV, TEST_EMAIL`); `logger` (pino); `LIMITS` (`{ DAILY: 50, START_HOUR: 9, END_HOUR: 18, MAX_RETRIES: 3, RETRY_DELAYS_MS: [3600000, 21600000, 86400000] }`).

- [ ] **Step 1: Write failing test `env.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";
describe("loadEnv", () => {
  it("parses valid env", () => {
    const e = loadEnv({ DATABASE_URL: "postgres://x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef", PORT: "4000", UPLOAD_DIR: "./uploads", NODE_ENV: "test" });
    expect(e.PORT).toBe(4000);
  });
  it("rejects short ENCRYPTION_KEY", () => {
    expect(() => loadEnv({ DATABASE_URL: "x", JWT_SECRET: "a", JWT_REFRESH_SECRET: "b", ENCRYPTION_KEY: "short" }))
      .toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail** — `npx vitest run src/config/env.test.ts` → FAIL (no `loadEnv`).

- [ ] **Step 3: Implement `env.ts`**

```ts
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
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
export const env = loadEnv();
```

- [ ] **Step 4: Implement `constants.ts`**

```ts
export const LIMITS = {
  DAILY: 50, START_HOUR: 9, END_HOUR: 18, MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [3_600_000, 21_600_000, 86_400_000] as const,
} as const;
```

- [ ] **Step 5: Implement `logger.ts`**

```ts
import pino from "pino";
import { env } from "../config/env.js";
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
});
```

- [ ] **Step 6: Run test, expect PASS** — `npx vitest run src/config/env.test.ts`

- [ ] **Step 7: Commit** — `git commit -am "feat: env config, constants, logger"`

---

# PHASE 1 — Database Schema & Migrations

### Task 1.1: Drizzle enums + client + drizzle config

**Files:**
- Create: `backend/drizzle.config.ts`, `backend/src/db/index.ts`, `backend/src/db/schema/enums.ts`, `backend/src/db/migrate.ts`

**Interfaces:**
- Produces: `db` (drizzle client), `contactStatus, logStatus, failureType, campaignMode, campaignState, queueStatus` pgEnums.

- [ ] **Step 1: `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 2: `src/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";
const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: `src/db/schema/enums.ts`**

```ts
import { pgEnum } from "drizzle-orm/pg-core";
export const contactStatus = pgEnum("contact_status", ["PENDING","PROCESSING","SENT","FAILED","BOUNCED","PAUSED"]);
export const logStatus = pgEnum("log_status", ["GENERATED","SENT","FAILED","BOUNCED","RETRY_SCHEDULED","SKIPPED"]);
export const failureType = pgEnum("failure_type", ["TEMPORARY","PERMANENT"]);
export const campaignMode = pgEnum("campaign_mode", ["DRAFT","TEST","LIVE"]);
export const campaignState = pgEnum("campaign_state", ["IDLE","RUNNING","PAUSED","STOPPED"]);
export const queueStatus = pgEnum("queue_status", ["SCHEDULED","PROCESSING","DONE","CANCELLED"]);
```

- [ ] **Step 4: `src/db/migrate.ts`**

```ts
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
const sql = postgres(env.DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
await sql.end();
console.log("migrations applied");
```

- [ ] **Step 5: Commit** — `git commit -am "feat: drizzle client + enums"`

### Task 1.2: All table schemas

**Files:**
- Create: `backend/src/db/schema/{contacts,imports,templates,logs,campaign,quota,settings,users}.ts`, `backend/src/db/schema/index.ts`

**Interfaces:**
- Produces: tables `contacts, contactsImports, emailTemplates, emailLogs, campaignSettings, campaignQueue, dailyQuota, appSettings, users` exactly per spec §3.

- [ ] **Step 1: `contacts.ts`**

```ts
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { contactStatus } from "./enums.js";
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  location: text("location"),
  email: text("email").notNull().unique(),
  contactPerson: text("contact_person"),
  status: contactStatus("status").notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: `imports.ts`**

```ts
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
export const contactsImports = pgTable("contacts_imports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 3: `templates.ts`**

```ts
import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("general"),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 4: `logs.ts`**

```ts
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts.js";
import { emailTemplates } from "./templates.js";
import { logStatus, failureType, campaignMode } from "./enums.js";
export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contacts.id),
  templateId: integer("template_id").references(() => emailTemplates.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  status: logStatus("status").notNull(),
  failureType: failureType("failure_type"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  aiUsed: boolean("ai_used").notNull().default(false),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 5: `campaign.ts`**

```ts
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts.js";
import { campaignMode, campaignState, queueStatus } from "./enums.js";
export const campaignSettings = pgTable("campaign_settings", {
  id: serial("id").primaryKey(),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  state: campaignState("state").notNull().default("IDLE"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(18),
  testEmail: text("test_email"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const campaignQueue = pgTable("campaign_queue", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: queueStatus("status").notNull().default("SCHEDULED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 6: `quota.ts`**

```ts
import { pgTable, serial, integer, date } from "drizzle-orm/pg-core";
export const dailyQuota = pgTable("daily_quota", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  emailsSent: integer("emails_sent").notNull().default(0),
});
```

- [ ] **Step 7: `settings.ts`**

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
// Single-row app settings; secret fields hold AES-GCM ciphertext. candidateProfile is JSON text.
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  emailProvider: text("email_provider").notNull().default("gmail"),
  gmailEmail: text("gmail_email"),
  gmailAppPasswordEnc: text("gmail_app_password_enc"),
  geminiApiKeyEnc: text("gemini_api_key_enc"),
  candidateProfile: text("candidate_profile").notNull().default("{}"),
  resumePath: text("resume_path"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 8: `users.ts`**

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 9: `index.ts`** — re-export every table + enums:

```ts
export * from "./enums.js";
export * from "./contacts.js";
export * from "./imports.js";
export * from "./templates.js";
export * from "./logs.js";
export * from "./campaign.js";
export * from "./quota.js";
export * from "./settings.js";
export * from "./users.js";
```

- [ ] **Step 10: Generate migration** — `cd backend && npm run db:generate` → expect a SQL file in `src/db/migrations`.

- [ ] **Step 11: Apply against local Postgres** — start a Postgres (e.g. `docker run -d --name jobapp-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=jobapp -p 5432:5432 postgres:16`), then `npm run db:migrate` → "migrations applied".

- [ ] **Step 12: Commit** — `git add -A && git commit -m "feat: database schema + initial migration"`

---

# PHASE 2 — Crypto, App Settings, Seeds

### Task 2.1: AES-256-GCM crypto util

**Files:**
- Create: `backend/src/utils/crypto.ts`
- Test: `backend/src/utils/crypto.test.ts`

**Interfaces:**
- Produces: `encrypt(plain: string): string` (returns `iv:tag:ciphertext` base64), `decrypt(payload: string): string`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";
describe("crypto", () => {
  it("round-trips", () => {
    const c = encrypt("super-secret");
    expect(c).not.toContain("super-secret");
    expect(decrypt(c)).toBe("super-secret");
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
const KEY = Buffer.from(env.ENCRYPTION_KEY, "utf8"); // 32 bytes
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}
export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(":").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test, expect PASS. Commit** — `git commit -am "feat: AES-256-GCM crypto util"`

### Task 2.2: Seed data (admin, settings, 10 templates)

**Files:**
- Create: `backend/src/db/seed/templates.ts`, `backend/src/db/seed/admin.ts`, `backend/src/db/seed/settings.ts`, `backend/src/db/seed/seed.ts`

**Interfaces:**
- Consumes: `db`, `encrypt`, table schemas.
- Produces: idempotent seed (uses `onConflictDoNothing`); admin `admin@local / Admin@123` (override via env later); 10 templates across the 5 categories; one `campaignSettings` row; one `appSettings` row with placeholder candidate profile.

- [ ] **Step 1: `templates.ts`** — export `TEMPLATE_SEED` array of 10 objects `{ name, category, subject, body }` covering categories: `software` (2), `backend` (2), `nodejs` (2), `fullstack` (2), `mern` (2). Bodies use placeholders `{{company}}`, `{{location}}`, `{{candidateName}}`, `{{signature}}`. Example entry:

```ts
export const TEMPLATE_SEED = [
  { name: "Software Developer — Intro", category: "software",
    subject: "Software Engineer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a Software Engineer with ~1 year of experience building backend and full-stack systems. I'd love to contribute to your team in {{location}}.\n\n{{signature}}" },
  // ...9 more, two per category, distinct wording
];
```

- [ ] **Step 2: `settings.ts`** — placeholder candidate profile:

```ts
export const CANDIDATE_PLACEHOLDER = {
  name: "Nikhil Malviya", phone: "<YOUR_PHONE_NUMBER>", email: "<YOUR_EMAIL>",
  role: "Software Engineer", experience: "Around 1 year",
  skills: ["Node.js","Express.js","NestJS","React.js","PostgreSQL","SQL","JavaScript","TypeScript","Microservices"],
  linkedin: "<YOUR_LINKEDIN_URL>", github: "<YOUR_GITHUB_URL>", portfolio: "<YOUR_PORTFOLIO_URL>",
};
```

- [ ] **Step 3: `admin.ts`** — hash `Admin@123` with bcrypt, insert admin user `onConflictDoNothing` by email.

- [ ] **Step 4: `seed.ts`** — orchestrate: insert templates, admin, settings row, campaignSettings row (defaults). Log counts. End pool.

- [ ] **Step 5: Run** — `npm run db:seed` → expect "seeded N templates, admin, settings". Re-run → no duplicates (idempotent).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: seed admin, settings, 10 templates"`

---

# PHASE 3 — App Bootstrap (Fastify app + error handler)

### Task 3.1: Error handler + Fastify app + health route

**Files:**
- Create: `backend/src/middleware/error-handler.ts`, `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Produces: `buildApp(): FastifyInstance` registering helmet, cors, rate-limit, jwt, multipart, error handler, and `GET /health`. `server.ts` boots app + scheduler.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "./app";
describe("app", () => {
  it("health returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: `error-handler.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "ValidationError", details: err.flatten() });
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) logger.error({ err }, "unhandled error");
    reply.code(status).send({ error: err.name ?? "Error", message: err.message });
  });
}
```

- [ ] **Step 4: `app.ts`**

```ts
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  registerErrorHandler(app);
  app.get("/health", async () => ({ status: "ok" }));
  // route modules registered here in later tasks
  return app;
}
```

- [ ] **Step 5: `server.ts`**

```ts
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startScheduler } from "./scheduler/index.js"; // added Phase 7
const app = await buildApp();
startScheduler();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info(`listening on ${env.PORT}`);
```
> Note: `startScheduler` import is added when Phase 7 lands; until then comment the two scheduler lines.

- [ ] **Step 6: Run test PASS. Commit** — `git commit -am "feat: fastify app, error handler, health route"`

---

# PHASE 4 — Authentication

### Task 4.1: Auth repository + service (login, refresh rotation, logout, me)

**Files:**
- Create: `backend/src/modules/auth/auth.repo.ts`, `auth.service.ts`, `auth.schema.ts`
- Test: `backend/src/modules/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, bcryptjs, `env`.
- Produces: `AuthService` with `login(email,password) → { accessToken, refreshToken, user }`, `refresh(token) → { accessToken, refreshToken }` (rotates + stores hashed), `logout(userId)`, `me(userId)`. Access token signed by Fastify jwt in controller; refresh token signed with `JWT_REFRESH_SECRET` (jsonwebtoken), 7d; stored bcrypt-hashed on user row.

- [ ] **Step 1: Failing test** — mock repo, assert login rejects bad password, returns tokens on good; refresh rejects token not matching stored hash.

```ts
import { describe, it, expect, vi } from "vitest";
import { AuthService } from "./auth.service";
const user = { id: 1, name: "A", email: "a@b.c", passwordHash: "", refreshToken: null };
// build with hashed password via bcrypt in test setup...
```
(Full test: hash `Admin@123`, stub `repo.findByEmail` → user, assert `login` returns `accessToken`/`refreshToken`; assert wrong password throws 401.)

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement `auth.repo.ts`** — `findByEmail`, `findById`, `setRefreshToken(id, hash|null)`.

- [ ] **Step 4: Implement `auth.service.ts`**

```ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { AuthRepo } from "./auth.repo.js";
export class AuthService {
  constructor(private repo: AuthRepo, private signAccess: (p: object) => string) {}
  async login(email: string, password: string) {
    const u = await this.repo.findByEmail(email);
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) { const e:any = new Error("Invalid credentials"); e.statusCode=401; throw e; }
    return this.issue(u);
  }
  async refresh(token: string) {
    let payload: any;
    try { payload = jwt.verify(token, env.JWT_REFRESH_SECRET); } catch { const e:any=new Error("Invalid refresh"); e.statusCode=401; throw e; }
    const u = await this.repo.findById(payload.sub);
    if (!u || !u.refreshToken || !(await bcrypt.compare(token, u.refreshToken))) { const e:any=new Error("Invalid refresh"); e.statusCode=401; throw e; }
    return this.issue(u);
  }
  async logout(userId: number) { await this.repo.setRefreshToken(userId, null); }
  async me(userId: number) { const u = await this.repo.findById(userId); return u && { id:u.id, name:u.name, email:u.email }; }
  private async issue(u: { id:number; name:string; email:string }) {
    const accessToken = this.signAccess({ sub: u.id, email: u.email });
    const refreshToken = jwt.sign({ sub: u.id }, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
    await this.repo.setRefreshToken(u.id, await bcrypt.hash(refreshToken, 10));
    return { accessToken, refreshToken, user: { id:u.id, name:u.name, email:u.email } };
  }
}
```

- [ ] **Step 5: Run test PASS. Commit** — `git commit -am "feat: auth service with refresh rotation"`

### Task 4.2: Auth controller + routes + guard middleware

**Files:**
- Create: `backend/src/middleware/auth-guard.ts`, `backend/src/modules/auth/auth.controller.ts`, `auth.routes.ts`
- Modify: `backend/src/app.ts` (register auth routes)
- Test: `backend/src/modules/auth/auth.routes.test.ts` (integration via `app.inject`, real DB or test DB)

**Interfaces:**
- Consumes: `AuthService`, Fastify `jwt`.
- Produces: routes `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (guarded), `GET /auth/me` (guarded); `authGuard` preHandler verifying access JWT → sets `req.user`.

- [ ] **Step 1: Failing integration test** — seed admin, `POST /auth/login {admin@local, Admin@123}` → 200 + tokens; `GET /auth/me` without token → 401; with token → 200 user.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: `auth-guard.ts`**

```ts
import type { FastifyRequest, FastifyReply } from "fastify";
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  try { await req.jwtVerify(); } catch { reply.code(401).send({ error: "Unauthorized" }); }
}
```

- [ ] **Step 4: `auth.schema.ts`** — Zod `loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })`, `refreshSchema = z.object({ refreshToken: z.string() })`.

- [ ] **Step 5: `auth.controller.ts` + `auth.routes.ts`** — wire service; build `AuthService` with `signAccess = (p)=>app.jwt.sign(p,{expiresIn:"15m"})`. Validate body with Zod. Logout/me use `authGuard`, read `req.user.sub`.

- [ ] **Step 6: Register in `app.ts`:** `await app.register(authRoutes, { prefix: "/auth" });`

- [ ] **Step 7: Run test PASS. Commit** — `git commit -am "feat: auth routes + jwt guard"`

---

# PHASE 5 — Contacts & Excel Import

### Task 5.1: Email validator + Excel streaming parser

**Files:**
- Create: `backend/src/utils/email-validator.ts`, `backend/src/integrations/excel/parser.ts`
- Test: `backend/src/utils/email-validator.test.ts`, `backend/src/integrations/excel/parser.test.ts`

**Interfaces:**
- Produces: `isValidEmail(s): boolean`; `parseContactsXlsx(filePath: string, onRow: (row:{companyName,location,email}, index:number)=>void): Promise<number>` (streams rows via ExcelJS `WorkbookReader`, maps header columns `companyName/location/email`, returns total data rows).

- [ ] **Step 1: Failing tests** — `isValidEmail("a@b.com")===true`, `isValidEmail("nope")===false`; parser test reads a small fixture `.xlsx` (create via ExcelJS in test setup) and collects 3 rows.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement validator**

```ts
const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (s: string): boolean => typeof s === "string" && RE.test(s.trim());
```

- [ ] **Step 4: Implement parser** using `exceljs` streaming reader; resolve header row to column indexes, then emit each subsequent row trimmed/lowercased email.

- [ ] **Step 5: Run tests PASS. Commit** — `git commit -am "feat: email validator + streaming xlsx parser"`

### Task 5.2: Contacts repo (bulk insert + query) + import service

**Files:**
- Create: `backend/src/modules/contacts/contacts.repo.ts`, `contacts.service.ts`, `contacts.schema.ts`
- Test: `backend/src/modules/contacts/contacts.service.test.ts`

**Interfaces:**
- Consumes: `db`, `contacts`, `contactsImports`, parser, validator.
- Produces: `ContactsRepo` (`bulkInsert(rows): Promise<{inserted:number}>` via chunked `insert().onConflictDoNothing()`, `list({search,status,page,limit})`, `getById`, `delete`, `recordImport(summary)`, `listImports()`); `ContactsService.importFromFile(filePath, fileName, jobId)` returning `{ total, imported, skipped, duplicate, invalid }` and updating an in-memory progress map; `ImportProgress` map keyed by jobId.

- [ ] **Step 1: Failing test** — feed service a fixture file, assert summary counts (valid imported, invalid skipped, duplicate within file counted). Use a test DB; truncate before.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement repo** — chunked insert (1000/chunk) with `onConflictDoNothing({ target: contacts.email })`; `list` builds `where` with `ilike` search on company/email + status eq + `limit/offset`, returns `{ rows, total }`.

- [ ] **Step 4: Implement import service** — stream rows, dedup within-file via a `Set`, validate, collect valid rows, bulk insert, compute duplicate = validCount - inserted; write `contactsImports` row; update progress map `{processed,total,done}`.

- [ ] **Step 5: Run test PASS. Commit** — `git commit -am "feat: contacts repo + excel import service"`

### Task 5.3: Contacts controller + routes (import, list, get, delete, progress, history)

**Files:**
- Create: `backend/src/modules/contacts/contacts.controller.ts`, `contacts.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/modules/contacts/contacts.routes.test.ts`

**Interfaces:**
- Produces (all guarded): `POST /contacts/import` (multipart; saves temp file, returns `{jobId}`, runs import async), `GET /contacts/import/:jobId/progress`, `GET /contacts/imports`, `GET /contacts?search&status&page&limit`, `GET /contacts/:id`, `DELETE /contacts/:id`.

- [ ] **Step 1: Failing test** — upload fixture via `app.inject` multipart → 202 `{jobId}`; poll progress → done; `GET /contacts` → list contains imported emails.

- [ ] **Step 2..5:** implement controller (stream `req.file()` to `UPLOAD_DIR/tmp`, generate `jobId` via `crypto.randomUUID()`, kick off `service.importFromFile` without awaiting, respond 202), routes with `authGuard`, register prefix `/contacts`. Run PASS. Commit — `git commit -am "feat: contacts routes incl. excel import + progress"`

---

# PHASE 6 — Templates

### Task 6.1: Templates repo + service + interpolation

**Files:**
- Create: `backend/src/modules/templates/templates.repo.ts`, `templates.service.ts`, `templates.schema.ts`, `backend/src/utils/interpolate.ts`
- Test: `templates.service.test.ts`, `interpolate.test.ts`

**Interfaces:**
- Produces: `interpolate(tpl: string, vars: Record<string,string>): string` (replaces `{{key}}`); `TemplatesRepo` CRUD; `TemplatesService` with `create/update/remove/list/get`, `pickRandomActive(): Promise<Template>`, `preview(id, vars)` → `{subject, body}` using interpolate; **versioning:** on `update`, increment `version`.

- [ ] **Step 1: Failing tests** — `interpolate("Hi {{company}}", {company:"X"})==="Hi X"`; `preview` returns interpolated subject/body; `update` bumps version.

- [ ] **Step 2-4:** implement, run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: templates crud, preview, interpolation, versioning"`

### Task 6.2: Templates controller + routes

**Files:** Create `templates.controller.ts`, `templates.routes.ts`; modify `app.ts`; test `templates.routes.test.ts`.

**Interfaces:** Produces (guarded): `POST /templates`, `GET /templates`, `GET /templates/:id`, `PUT /templates/:id`, `DELETE /templates/:id`, `POST /templates/:id/preview` (body: vars).

- [ ] Steps: failing test (create→list→preview→update→delete happy path) → implement → PASS → commit `feat: templates routes`.

---

# PHASE 7 — Email Provider Abstraction & Failure Classification

### Task 7.1: EmailProvider interface + types + classifier

**Files:**
- Create: `backend/src/integrations/email/provider.ts`, `classify-failure.ts`
- Test: `classify-failure.test.ts`

**Interfaces:**
- Produces:
```ts
export interface OutgoingEmail { to: string; subject: string; html: string; attachments?: { filename: string; path: string }[]; }
export interface SendResult { messageId: string; }
export interface EmailProvider { name: string; verify(): Promise<void>; send(msg: OutgoingEmail): Promise<SendResult>; }
export type FailureType = "TEMPORARY" | "PERMANENT";
export interface ClassifiedError { type: FailureType; code: string; message: string; isQuota: boolean; }
export function classifyFailure(err: unknown): ClassifiedError;
```
- `classifyFailure` rules: Nodemailer error `responseCode` 5xx OR message matches `/no such user|mailbox unavailable|address rejected|domain not found|user unknown/i` → PERMANENT. `responseCode` 4xx, `ECONNRESET/ETIMEDOUT/ESOCKET`, or message `/timeout|temporarily/i` → TEMPORARY. Gmail quota message `/(daily.*limit|quota|550 5.4.5)/i` → TEMPORARY + `isQuota:true`. Default → TEMPORARY.

- [ ] **Step 1: Failing tests** — feed synthetic errors, assert type/isQuota for: `{responseCode:550, message:"No such user"}`→PERMANENT; `{responseCode:421}`→TEMPORARY; `{message:"Daily user sending limit exceeded"}`→TEMPORARY+isQuota; `{code:"ETIMEDOUT"}`→TEMPORARY.

- [ ] **Step 2-4:** implement, run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: EmailProvider interface + failure classifier"`

### Task 7.2: GmailProvider + provider factory

**Files:**
- Create: `backend/src/integrations/email/gmail-provider.ts`, `factory.ts`
- Test: `gmail-provider.test.ts` (mock nodemailer `createTransport`)

**Interfaces:**
- Consumes: `nodemailer`, decrypted Gmail creds from settings service (Phase 11) — for now factory takes creds as args.
- Produces: `GmailProvider` (pooled transport `{ service:"gmail", pool:true, maxConnections:1, auth:{user,pass} }`, `verify()` calls `transporter.verify()`, `send()` maps to `sendMail`); `getEmailProvider(settings): EmailProvider` returning GmailProvider for `name==="gmail"` (throws "unsupported provider" otherwise — Outlook/SES/SendGrid are future).

- [ ] **Step 1: Failing test** — mock `createTransport` returning `{ sendMail: vi.fn().mockResolvedValue({messageId:"x"}), verify: vi.fn() }`; assert `send` returns `{messageId:"x"}` and passes `from`, `to`, `subject`, `html`, `attachments`.

- [ ] **Step 2-4:** implement, run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: GmailProvider via nodemailer + provider factory"`

---

# PHASE 8 — Gemini Personalization

### Task 8.1: Gemini client with template fallback

**Files:**
- Create: `backend/src/integrations/gemini/client.ts`, `prompt.ts`
- Test: `client.test.ts`

**Interfaces:**
- Produces: `personalize(input): Promise<{ subject: string; body: string; aiUsed: boolean }>` where `input = { template:{subject,body}, vars:{company,location,candidate}, apiKey?:string }`. If `apiKey` empty → return interpolated template, `aiUsed:false`. Else call Gemini (`gemini-1.5-flash`) with a constrained prompt (personalize greeting/opening/subject, mention company+location, keep concise/professional, DO NOT invent facts, return JSON `{subject,body}`); parse JSON; on ANY error → fallback to interpolation, `aiUsed:false`.

- [ ] **Step 1: Failing tests** — (a) empty apiKey → returns interpolated template with `aiUsed:false`; (b) inject a fake model client that throws → fallback `aiUsed:false`; (c) fake model returns valid JSON → `aiUsed:true` with personalized subject. Use dependency injection: `personalize(input, modelFactory?)`.

- [ ] **Step 2-4:** implement with `prompt.ts` building the instruction; wrap call in try/catch; validate model JSON with Zod `{subject:string, body:string}`.

- [ ] **Step 5: Commit** — `git commit -am "feat: gemini personalization with template fallback"`

---

# PHASE 9 — Settings Service (needed by send job & scheduler)

### Task 9.1: Settings repo + service (decrypt creds, candidate profile, resume)

**Files:**
- Create: `backend/src/modules/settings/settings.repo.ts`, `settings.service.ts`, `settings.schema.ts`
- Test: `settings.service.test.ts`

**Interfaces:**
- Consumes: `db`, `appSettings`, `campaignSettings`, `encrypt`, `decrypt`.
- Produces: `SettingsService` with `getGmailCreds(): Promise<{email,password}|null>` (decrypts), `getGeminiKey(): Promise<string>`, `getCandidateProfile(): Promise<CandidateProfile>`, `buildSignature(profile): string`, `getResumePath()`, `updateGmail({email,appPassword})` (encrypts), `updateGemini({apiKey})`, `updateCandidate(profile)`, `setResumePath(path)`, `getEmailProviderName()`. **API never returns decrypted secrets** — `getPublic()` returns booleans `{gmailConfigured, geminiConfigured, ...}` + candidate profile + resume filename.

- [ ] **Step 1: Failing tests** — `updateGmail` stores ciphertext (not plaintext) and `getGmailCreds` round-trips; `getPublic` omits secrets; `buildSignature` includes name/role/phone/email/links.

- [ ] **Step 2-4:** implement, run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: settings service (encrypted creds, candidate profile)"`

### Task 9.2: Settings controller + routes + resume upload

**Files:** Create `settings.controller.ts`, `settings.routes.ts`; modify `app.ts`; test `settings.routes.test.ts`.

**Interfaces:** Produces (guarded): `GET /settings` (public view), `PATCH /settings/gmail`, `PATCH /settings/gemini`, `PATCH /settings/candidate`, `PATCH /settings/campaign` (mode/dailyLimit/window/testEmail/provider), `POST /settings/resume` (multipart → save to `UPLOAD_DIR/resume.pdf`, set path).

- [ ] Steps: failing test (update gmail → GET shows `gmailConfigured:true`, no secret; upload resume → path set) → implement → PASS → commit `feat: settings routes + resume upload`.

---

# PHASE 10 — Campaign Engine (queue, send job, scheduler)

### Task 10.1: Daily schedule generator

**Files:**
- Create: `backend/src/utils/schedule.ts`
- Test: `schedule.test.ts`

**Interfaces:**
- Produces: `generateSendTimes(count: number, startHour: number, endHour: number, baseDate: Date, rand?: ()=>number): Date[]` — returns `count` sorted Dates within `[startHour, endHour)` on `baseDate`, with randomized gaps, strictly increasing (no duplicates), none in the past relative to `baseDate` if `baseDate` carries a time.

- [ ] **Step 1: Failing tests** — with injected deterministic `rand`, returns exactly `count` times, all within window, strictly ascending; `count=0` → `[]`.

- [ ] **Step 2-4:** implement (partition window into `count` buckets, place each time at bucket start + `rand()*bucketSize`), run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: human-like daily schedule generator"`

### Task 10.2: Campaign repo + queue + quota repo

**Files:**
- Create: `backend/src/modules/campaign/campaign.repo.ts`, `campaign.schema.ts`
- Test: `campaign.repo.test.ts`

**Interfaces:**
- Produces: `CampaignRepo` with `getSettings()`, `setState(state)`, `setMode(mode)`, `updateSettings(patch)`; `enqueue(rows:{contactId,scheduledAt}[])`, `dueQueueItems(now): {id,contactId}[]` (status SCHEDULED, scheduledAt<=now), `markQueue(id,status)`, `clearScheduledQueue()`; `selectableContacts(limit)` (status PENDING, `nextRetryAt` null or <=now, not BOUNCED/SENT/PROCESSING); `incQuota(date)`, `getQuota(date)`, `countByStatus()`.

- [ ] **Step 1: Failing tests** — seed contacts, `selectableContacts` excludes BOUNCED + future `nextRetryAt`; `incQuota` upserts daily row.

- [ ] **Step 2-4:** implement, run PASS. Commit — `feat: campaign repo (queue, quota, selection)`.

### Task 10.3: Send-email job (the core unit)

**Files:**
- Create: `backend/src/jobs/send-email.ts`
- Test: `send-email.test.ts`

**Interfaces:**
- Consumes: `TemplatesService.pickRandomActive`, `personalize`, `getEmailProvider`, `SettingsService`, `CampaignRepo`, `LogsRepo` (Phase 11 — define interface now, inject), `classifyFailure`, `LIMITS`.
- Produces: `sendEmailJob(contactId: number, deps): Promise<{ outcome: "sent"|"draft"|"retry"|"failed"|"bounced"|"paused" }>` implementing the full decision tree:
  1. Load contact, settings (mode), candidate profile, resume path, gemini key, provider creds.
  2. Pick random active template; `personalize` → subject/body/aiUsed.
  3. **DRAFT** → write log `GENERATED` (mode DRAFT), set contact back to PENDING, return `draft`.
  4. **TEST** → recipient = `testEmail`; **LIVE** → recipient = contact.email.
  5. Send via provider. On success: log `SENT`, contact `SENT` + `sentAt`, `incQuota`, return `sent`.
  6. On error: `classifyFailure`. If `isQuota` → set campaign `PAUSED`, log `SKIPPED` (reason quota), **leave contact PENDING**, return `paused`. If `PERMANENT` → contact `BOUNCED`, log `BOUNCED`, return `bounced`. If `TEMPORARY` → `retryCount++`; if `> MAX_RETRIES` → contact `FAILED`, log `FAILED`; else set `nextRetryAt = now + RETRY_DELAYS_MS[retryCount-1]`, contact back to PENDING, log `RETRY_SCHEDULED`, return `retry`.

- [ ] **Step 1: Failing tests** (inject all deps as mocks) covering each branch: draft, test-mode recipient override, live success, quota→paused (contact stays PENDING), permanent→bounced, temporary first failure→nextRetryAt=+1h, temporary 4th→FAILED. Assert log status + contact status + quota calls per branch.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** the decision tree exactly as above; all DB writes via injected repos; never import Gmail directly (use provider).

- [ ] **Step 4: Run tests PASS.**

- [ ] **Step 5: Commit** — `git commit -am "feat: send-email job with mode + retry + bounce + quota handling"`

### Task 10.4: Queue generation job + scheduler tick

**Files:**
- Create: `backend/src/jobs/generate-queue.ts`, `backend/src/scheduler/tick.ts`, `backend/src/scheduler/index.ts`
- Modify: `backend/src/server.ts` (enable `startScheduler`)
- Test: `tick.test.ts`, `generate-queue.test.ts`

**Interfaces:**
- Produces:
  - `generateDailyQueue(deps, now): Promise<number>` — if state RUNNING and no SCHEDULED queue rows for today: compute `remaining = dailyLimit - quotaToday`, pick `remaining` selectable contacts, `generateSendTimes`, `enqueue`. Returns enqueued count.
  - `campaignTick(deps, now): Promise<void>` — if state !== RUNNING return; if before startHour/after endHour return; ensure today's queue (call generateDailyQueue); for each due queue item: mark PROCESSING, run `sendEmailJob`, mark queue DONE; **stop early if state became PAUSED** (quota hit). Process at most one due item per tick to enforce no-bulk/no-simultaneous.
  - `startScheduler()` — `cron.schedule("* * * * *", () => campaignTick(realDeps, new Date()))` plus a daily `cron.schedule("0 0 * * *", resume-if-paused-by-quota)` that flips PAUSED→RUNNING at midnight.

- [ ] **Step 1: Failing tests** — `generateDailyQueue` enqueues `min(remaining, selectable)`; `campaignTick` when state IDLE does nothing; when RUNNING + due item → calls `sendEmailJob` once and marks queue DONE; when `sendEmailJob` returns `paused` → tick stops processing further items.

- [ ] **Step 2-4:** implement with injected deps for tests; `startScheduler` wires real deps. Enable scheduler import in `server.ts`. Run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: scheduler tick + daily queue generation + midnight resume"`

### Task 10.5: Campaign service + controller + routes

**Files:** Create `campaign.service.ts`, `campaign.controller.ts`, `campaign.routes.ts`; modify `app.ts`; test `campaign.routes.test.ts`.

**Interfaces:** Produces:
- `CampaignService`: `start()` (state→RUNNING, generate today's queue), `pause()` (→PAUSED), `resume()` (→RUNNING), `stop()` (→STOPPED, `clearScheduledQueue`, cancel SCHEDULED), `setMode(mode)`, `status()` → `{ state, mode, quotaToday, dailyLimit, nextScheduledAt, countsByStatus }`.
- Routes (guarded): `POST /campaign/start|pause|resume|stop`, `PATCH /campaign/mode`, `GET /campaign/status`.

- [ ] Steps: failing test (start → status RUNNING + queue rows; pause → PAUSED; mode change persists) → implement → PASS → commit `feat: campaign control routes`.

---

# PHASE 11 — Logs & Analytics

### Task 11.1: Logs repo + service + routes

**Files:** Create `backend/src/modules/logs/logs.repo.ts`, `logs.service.ts`, `logs.controller.ts`, `logs.routes.ts`; modify `app.ts`; test `logs.routes.test.ts`.

**Interfaces:**
- Produces: `LogsRepo.create(log)` (used by send-email job — this is the `LogsRepo` interface injected in Task 10.3), `list({status,search,page,limit})`; routes (guarded) `GET /logs?status=sent|failed|bounced&search&page&limit`.

> **Sequencing note:** define the `LogsRepo` interface (`create(input): Promise<void>`) in Task 10.3 as an injected dependency; this task provides the concrete implementation. The send-email job depends only on the interface.

- [ ] Steps: failing test (insert logs, filter by status, search by subject) → implement → PASS → commit `feat: logs repo + routes`.

### Task 11.2: Analytics repo + service + routes

**Files:** Create `backend/src/modules/analytics/analytics.repo.ts`, `analytics.service.ts`, `analytics.controller.ts`, `analytics.routes.ts`; modify `app.ts`; test `analytics.service.test.ts`.

**Interfaces:**
- Produces: `AnalyticsService.dashboard()` → `{ totalContacts, pending, sent, failed, bounced, emailsSentToday, successRate, failureRate, totalImportedContacts, totalEmailsGenerated, totalEmailsSent, totalBounced, totalFailed, aiUsagePercent, averageEmailsPerDay, importHistory }`; `daily(range)` → `[{date,sent,failed}]`; `monthly()` → `[{month,sent,failed}]`. All via SQL aggregates in the repo (count by status, sum quota, `count(aiUsed)/count(*)` for AI %, sum `importedRows`, avg of daily_quota.emailsSent).

- [ ] **Step 1: Failing test** — seed contacts in mixed statuses + logs + quota rows; assert `successRate`, `failureRate`, `aiUsagePercent`, counts match expected.

- [ ] **Step 2-4:** implement aggregates, run PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: analytics service + routes"`

---

# PHASE 12 — Backend Docker & verification

### Task 12.1: Backend Dockerfile + end-to-end smoke

**Files:** Create `backend/Dockerfile`, `backend/.dockerignore`.

- [ ] **Step 1: Multi-stage `Dockerfile`** (node:20-alpine builder → runner; copy dist + node_modules prod; CMD runs migrate then `node dist/server.js`).

- [ ] **Step 2: Build** — `docker build -t jobapp-backend ./backend` → success.

- [ ] **Step 3: Full backend test suite** — `cd backend && npm run test` → all PASS.

- [ ] **Step 4: Manual smoke** — with Postgres up + migrated + seeded: start server, `POST /auth/login`, import a fixture xlsx, set mode DRAFT, `POST /campaign/start`, observe `email_logs` rows `GENERATED`. Document in README.

- [ ] **Step 5: Commit** — `git commit -am "feat: backend Dockerfile + e2e smoke verified"`

---

# PHASE 13 — Frontend Foundation

### Task 13.1: Vite + Tailwind + tooling scaffold

**Files:** Create `frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/index.css`, `frontend/.env.example`.

**Interfaces:** Produces running `npm run dev` Vite app with Tailwind + dark mode (`darkMode: "class"`).

- [ ] **Step 1:** `package.json` deps: react, react-dom, react-router-dom, @tanstack/react-query, axios, react-hook-form, zod, @hookform/resolvers, recharts, zustand, lucide-react; dev: vite, @vitejs/plugin-react, typescript, tailwindcss, postcss, autoprefixer, vitest, @testing-library/react, jsdom.
- [ ] **Step 2:** Tailwind config (`content: ["./index.html","./src/**/*.{ts,tsx}"]`, `darkMode:"class"`), `index.css` with `@tailwind` directives.
- [ ] **Step 3:** `.env.example` → `VITE_API_URL=http://localhost:4000`.
- [ ] **Step 4:** `npm install && npm run build` → success.
- [ ] **Step 5: Commit** — `git commit -am "chore: scaffold frontend (vite+tailwind)"`

### Task 13.2: Axios client with refresh interceptor + auth store

**Files:** Create `frontend/src/services/client.ts`, `src/store/auth.ts`, `src/store/theme.ts`, `src/types/api.ts`.
Test: `src/services/client.test.ts`.

**Interfaces:**
- Produces: `apiClient` (axios, baseURL `VITE_API_URL`, attaches `Authorization: Bearer <access>` from auth store; on 401 once, calls `/auth/refresh` with stored refresh token, updates store, retries original; on refresh fail → clear store + redirect login). `useAuth` zustand store (`accessToken, refreshToken, user, setTokens, clear`, persisted to localStorage). `useTheme` store (toggle `dark` class on `document.documentElement`).

- [ ] **Step 1: Failing test** — mock adapter: first call 401, refresh returns new token, retried call 200; assert store updated + request retried.
- [ ] **Step 2-4:** implement, run PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: axios refresh interceptor + auth/theme stores"`

### Task 13.3: Router, ProtectedRoute, AppLayout, UI primitives

**Files:** Create `src/routes/index.tsx`, `src/routes/ProtectedRoute.tsx`, `src/layouts/AppLayout.tsx`, `src/layouts/AuthLayout.tsx`, `src/App.tsx`, `src/components/ui/{Button,Card,Input,Table,Modal,Spinner,StatusBadge,Toaster}.tsx`.

**Interfaces:** Produces sidebar layout (nav links: Dashboard, Contacts, Templates, Campaign, Logs, Analytics, Settings), dark-mode toggle, toast provider, `ProtectedRoute` redirecting to `/login` when no token. React Query `QueryClientProvider` in `App.tsx`.

- [ ] **Step 1:** Build primitives (Tailwind, accessible). `StatusBadge` maps statuses→colors.
- [ ] **Step 2:** AppLayout with `<Outlet/>`, sidebar, theme toggle, logout.
- [ ] **Step 3:** Router with public `/login` and protected app routes.
- [ ] **Step 4:** `npm run build` → success; manual: app redirects to /login.
- [ ] **Step 5: Commit** — `git commit -am "feat: router, protected routes, app layout, ui primitives"`

---

# PHASE 14 — Frontend Pages

> Each page task: create api module (`services/<x>.api.ts`) + react-query hooks (`hooks/use-<x>.ts`) + page component. Test = one component/integration test with React Query mocked via msw or a stubbed client. Commit per page.

### Task 14.1: Login page
**Files:** `services/auth.api.ts`, `hooks/use-auth.ts`, `pages/Login.tsx`. Test: `Login.test.tsx`.
- [ ] RHF + Zod form (email/password) → `auth.api.login` → store tokens → navigate `/`. Show error toast on 401. Test: submit fills store on success. Commit `feat: login page`.

### Task 14.2: Dashboard page
**Files:** `services/analytics.api.ts`, `hooks/use-analytics.ts`, `pages/Dashboard.tsx`, `components/charts/{LineTrend,RatePie}.tsx`. Test: `Dashboard.test.tsx`.
- [ ] Cards: Total Contacts, Pending, Sent, Failed, Bounced, Emails Sent Today. Charts: Daily Email Activity (LineTrend from `/analytics/daily`), Success/Failure rate (RatePie). Import-history table (last 5 from dashboard payload). Loading skeletons + error state. Test: renders cards from mocked dashboard data. Commit `feat: dashboard page`.

### Task 14.3: Contacts page
**Files:** `services/contacts.api.ts`, `hooks/use-contacts.ts`, `pages/Contacts.tsx`. Test: `Contacts.test.tsx`.
- [ ] Data table (server pagination), search box, status filter, delete action with confirm modal, **Import** button (file picker → `POST /contacts/import` → poll progress with a progress bar → toast summary), **Export** (client-side CSV of current page). Test: renders rows from mocked list; import shows progress. Commit `feat: contacts page`.

### Task 14.4: Templates page
**Files:** `services/templates.api.ts`, `hooks/use-templates.ts`, `pages/Templates.tsx`. Test: `Templates.test.tsx`.
- [ ] List + create/edit modal (RHF+Zod: name, category, subject, body), delete confirm, **Preview** (modal calls `/templates/:id/preview` with sample vars, renders subject+body). Test: create flow calls api. Commit `feat: templates page`.

### Task 14.5: Campaign page
**Files:** `services/campaign.api.ts`, `hooks/use-campaign.ts`, `pages/Campaign.tsx`. Test: `Campaign.test.tsx`.
- [ ] Status panel (state, mode, quotaToday/dailyLimit, next scheduled), mode selector (DRAFT/TEST/LIVE) with a clear warning on LIVE, Start/Pause/Resume/Stop buttons (disabled per current state), live status polling (refetch interval 15s). Test: buttons call correct endpoints; LIVE shows warning. Commit `feat: campaign page`.

### Task 14.6: Logs page
**Files:** `services/logs.api.ts`, `hooks/use-logs.ts`, `pages/Logs.tsx`. Test: `Logs.test.tsx`.
- [ ] Tabs: All / Sent / Failed / Bounced; search; table with status badge, subject, contact, error message, retryCount, nextRetryAt, sentAt; pagination. Test: tab switch refetches with status filter. Commit `feat: logs page`.

### Task 14.7: Analytics page
**Files:** reuse `analytics.api`, `pages/Analytics.tsx`. Test: `Analytics.test.tsx`.
- [ ] Charts: daily & monthly trends (LineTrend), success/failure pies, AI usage %, average emails/day, totals grid. Range selector. Test: renders monthly chart from mocked data. Commit `feat: analytics page`.

### Task 14.8: Settings page
**Files:** `services/settings.api.ts`, `hooks/use-settings.ts`, `pages/Settings.tsx`. Test: `Settings.test.tsx`.
- [ ] Sections: **Gmail** (email + app password write-only; shows "Configured ✓"), **Gemini** (api key write-only), **Campaign** (dailyLimit, startHour, endHour, testEmail, mode, provider), **Candidate Profile** (name, phone, email, role, experience, skills tags, linkedin, github, portfolio), **Resume Upload** (file → `POST /settings/resume`, shows current filename). RHF+Zod per section; secrets never pre-filled. Test: candidate save calls PATCH; gmail field is write-only. Commit `feat: settings page`.

---

# PHASE 15 — Docker Compose, Docs, Final Verification

### Task 15.1: Frontend Dockerfile + nginx
**Files:** Create `frontend/Dockerfile` (build → nginx:alpine serving `dist`, SPA fallback via `nginx.conf`), `frontend/nginx.conf`, `frontend/.dockerignore`.
- [ ] Build `docker build -t jobapp-frontend ./frontend` → success. Commit `feat: frontend Dockerfile + nginx`.

### Task 15.2: docker-compose
**Files:** Create root `docker-compose.yml` (services: `postgres` (16, volume, healthcheck), `backend` (depends_on postgres healthy, env from `.env`, runs migrate+seed+start), `frontend` (depends_on backend, `VITE_API_URL` build arg)).
- [ ] `docker compose up --build` → all healthy; open frontend, log in, import fixture, DRAFT campaign generates logs. Commit `feat: docker-compose for full stack`.

### Task 15.3: README + API docs + .env examples
**Files:** Create/expand root `README.md`, `docs/API.md`.
- [ ] README: overview, prerequisites, env setup, local dev (backend+frontend), docker, seeding, **default admin creds**, **how to configure Gmail App Password / Gemini key / candidate profile / resume via Settings**, the **bounce-detection limitation** note, retry/quota behavior, campaign modes.
- [ ] `docs/API.md`: every endpoint with method, auth, request/response shape (generated from the route schemas).
- [ ] Commit `docs: README + API documentation`.

### Task 15.4: Full-stack verification pass
- [ ] Backend: `cd backend && npm run test` → all PASS.
- [ ] Frontend: `cd frontend && npm run test && npm run build` → PASS + build clean.
- [ ] `docker compose up` smoke: login → import → templates preview → DRAFT start → logs populate → analytics show counts.
- [ ] Record results in README "Verification" section. Commit `chore: final verification`.

---

## Self-Review

**Spec coverage check (spec § → task):**
- §2 architecture/folders → File Structure + all module tasks ✓
- §3 every table → Tasks 1.1–1.2 (contacts, contacts_imports, templates, logs, campaign_settings, campaign_queue, daily_quota, app_settings, users) ✓
- §4 engine/modes/failure/retry/quota/dup → Tasks 10.1–10.5 (esp. 10.3 decision tree) ✓
- §5 Gemini personalize-only + fallback → Task 8.1 ✓
- §6 EmailProvider abstraction → Tasks 7.1–7.2 ✓
- §7 candidate profile + resume upload → Tasks 9.1–9.2, 14.8 ✓
- §8 API contract → all `*.routes` tasks ✓
- §9 analytics (incl. all added metrics) → Task 11.2 ✓
- §10 frontend pages → Phase 14 ✓
- §11 security (helmet/cors/rate-limit/zod/encrypt) → Tasks 3.1, 2.1, 9.1, per-route Zod ✓
- §12 docker + seeds → Tasks 2.2, 12.1, 15.1–15.2 ✓
- §13a v2 seam → documented, no v1 task (intentional) ✓
- §14 env vars → Task 0.1 `.env.example` ✓

**Placeholder scan:** Candidate PII placeholders are intentional (seeded, edited via UI) — not plan gaps. No "TODO/TBD" left in steps.

**Type consistency:** `EmailProvider`/`OutgoingEmail`/`SendResult`/`classifyFailure` defined in Task 7.1 and consumed in 7.2/10.3; `LogsRepo.create` interface declared in 10.3, implemented in 11.1; `personalize` signature consistent across 8.1/10.3; `generateSendTimes` consistent across 10.1/10.4; status enums consistent with constants.
