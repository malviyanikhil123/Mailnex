# Automated Job Application Platform

Import 23,800+ recruiter contacts from Excel and automatically send Gemini-personalized
job-application emails over time — capped at 50/day within a 09:00–18:00 window, at
human-like random intervals, from a single Gmail account. Managed through a React dashboard.

- **Backend:** Node 20+, TypeScript, Fastify, PostgreSQL, Drizzle ORM (node-postgres `pg` Pool), Nodemailer, Gemini, ExcelJS, node-cron, JWT, Zod, Pino
- **Frontend:** React, TypeScript, Vite, Tailwind, React Query, Axios, React Hook Form, Zod, Recharts, Zustand

## Table of contents

1. [Overview](#overview)
2. [Monorepo layout](#monorepo-layout)
3. [Installation guide](#installation-guide)
4. [PostgreSQL setup (DB_HOST style)](#postgresql-setup-db_host-style)
5. [Backend setup](#backend-setup)
6. [Frontend setup](#frontend-setup)
7. [Drizzle migration guide](#drizzle-migration-guide)
8. [Gmail App Password setup](#gmail-app-password-setup)
9. [Gemini API setup](#gemini-api-setup)
10. [Excel import format](#excel-import-format)
11. [Candidate profile setup](#candidate-profile-setup)
12. [Resume upload process](#resume-upload-process)
13. [Campaign workflow: DRAFT → TEST → LIVE](#campaign-workflow-draft--test--live)
14. [Production deployment](#production-deployment)
15. [Verification status](#verification-status)

## Overview

The system imports recruiter contacts, then a scheduler sends one personalized email at a
time on a persistent, restart-safe daily queue. Gemini only *personalizes* an existing
template (greeting, opening paragraph, subject); if the key is missing or the call fails it
falls back to the raw interpolated template, so sending never stalls. Secrets (Gmail App
Password, Gemini key) are encrypted at rest (AES-256-GCM) and edited from the dashboard.

## Monorepo layout

```
backend/    Fastify API + scheduler (clean layered architecture)
frontend/   React + Vite dashboard
samples/    sample Excel import + resume placeholder
docs/       design spec, implementation plan, API reference
docker-compose.yml
CHECKLIST.md
```

## Installation guide

**Prerequisites:** Node.js 20+ and npm 10+, PostgreSQL 16 (local/hosted/Docker), a Gmail
account with an App Password, and optionally a Gemini API key.

```bash
# Backend
cd backend && cp .env.example .env && npm install

# Frontend
cd ../frontend && cp .env.example .env && npm install
```

## PostgreSQL setup (DB_HOST style)

This project uses **individual connection values — there is no `DATABASE_URL`.** Set these in
`backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=email_automation
```

The connection is built with a node-postgres pool:

```ts
const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
});
const db = drizzle(pool);
```

Create the database first (if it doesn't exist):

```sql
CREATE DATABASE email_automation;
```

## Backend setup

```bash
cd backend
cp .env.example .env          # set DB_* + JWT_SECRET + JWT_REFRESH_SECRET + ENCRYPTION_KEY (32 chars)
npm install                   # install dependencies
npm run db:generate           # (already generated) regenerate SQL only if the schema changes
npm run db:migrate            # apply migrations to your database
npm run db:seed               # seed admin user, settings, 10 templates
npm run dev                   # start dev server → http://localhost:4000
npm test                      # unit tests (DB-integration tests are gated, see below)
npm run build                 # compile TypeScript → dist/
npm start                     # run the production build
```

Full backend env (`backend/.env.example`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=email_automation
JWT_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef   # exactly 32 chars
GMAIL_EMAIL=
GMAIL_APP_PASSWORD=
GEMINI_API_KEY=
PORT=4000
UPLOAD_DIR=./uploads
NODE_ENV=development
TEST_EMAIL=
```

**Default login after seeding:** `admin@local` / `Admin@123` (change this in production).

DB-integration & route tests are skipped unless you opt in:

```bash
RUN_DB_TESTS=1 DB_HOST=localhost DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=password DB_DATABASE=email_automation npm test
```

## Frontend setup

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
npm run lint                  # tsc type-check
npm run build                 # production build → dist/
npm run preview               # preview the production build
```

## Drizzle migration guide

- Schema lives in `backend/src/db/schema/*.ts`.
- After changing the schema: `npm run db:generate` writes a new SQL file to
  `backend/src/db/migrations/`.
- Apply migrations: `npm run db:migrate` (uses the `DB_*` values).
- `drizzle.config.ts` reads `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE` — no URL.
- In Docker, the backend container runs `migrate` then `seed` then `start` automatically.

## Gmail App Password setup

1. Enable 2-Step Verification on your Google account.
2. Go to **Google Account → Security → App passwords**
   (https://support.google.com/accounts/answer/185833).
3. Generate a 16-character app password for "Mail".
4. In the dashboard: **Settings → Gmail** → enter your Gmail address + the app password →
   **Save Gmail**. It is encrypted at rest and never returned in plaintext.

## Gemini API setup

1. Create a key at Google AI Studio (https://aistudio.google.com/app/apikey).
2. In the dashboard: **Settings → Gemini** → paste the key → **Save Key** (encrypted at rest).
3. Optional — without a key, emails are sent using the raw interpolated template
   (`aiUsed=false`); the campaign never blocks on AI availability.

## Excel import format

Upload via **Contacts → Import Excel**. The first worksheet is read and columns are mapped
**by header name**:

| Column | Required |
|--------|----------|
| `companyName` | yes |
| `location` | no |
| `email` | yes |

Invalid emails are skipped; duplicates (within the file and against the database) are
de-duplicated; a summary (total / imported / skipped / duplicate / invalid) is recorded and
shown in import history. A ready-to-use example is in `samples/sample-hr-contacts.xlsx`.

## Candidate profile setup

In **Settings → Candidate Profile**, fill in: Name, Phone, Email, Role, Experience, Skills
(comma-separated), LinkedIn, GitHub, Portfolio. These populate the email signature
(`{{signature}}`) and `{{candidateName}}` in templates. Seeded values are placeholders —
replace them with your own.

## Resume upload process

In **Settings → Resume → Upload Resume**, select your `resume.pdf`. It is stored under the
backend `UPLOAD_DIR` and automatically attached to every outgoing email. To change it,
re-upload — no manual file swapping. A placeholder is in `samples/sample-resume.txt`.

## Campaign workflow: DRAFT → TEST → LIVE

1. **DRAFT** (default) — **Campaign → Mode → DRAFT**, then **Start**. The scheduler generates
   and logs personalized emails **without sending**. Review them under **Logs**.
2. **TEST** — set **Settings → Campaign → Test email**, switch **Mode → TEST**. Every email is
   sent only to your test address so you can verify formatting + attachment.
3. **LIVE** — switch **Mode → LIVE** (a warning is shown). Real emails go to real contacts, at
   most `dailyLimit` (50) per day within the sending window, one at a time at random intervals.

Controls: **Start / Pause / Resume / Stop**. Temporary failures retry at +1h, +6h, +24h then
mark `FAILED`; permanent failures mark `BOUNCED` (never retried). If Gmail's daily limit is
hit, the campaign auto-pauses and resumes the next day (contacts stay `PENDING`).

### Bounce-detection limitation

True bounces are asynchronous. Without an IMAP poller, failures are classified only from the
synchronous SMTP response at send time. The classifier is pluggable so an IMAP poller can be
added later without changing the engine.

## Production deployment

**Docker (full stack):**

```bash
cp .env.example .env          # set DB_USERNAME/DB_PASSWORD/DB_DATABASE, JWT secrets, ENCRYPTION_KEY
docker compose up --build
```

- Frontend: http://localhost:8080  ·  Backend: http://localhost:4000  ·  Postgres: localhost:5432
- The backend container runs migrations + seed on boot.

**Manual:**

1. Provision PostgreSQL; set `DB_*` in the backend environment.
2. `cd backend && npm ci && npm run build && npm run db:migrate && npm run db:seed && npm start`
3. `cd frontend && npm ci && VITE_API_URL=<api-url> npm run build` → serve `dist/` behind nginx.
4. Log in, configure Gmail/Gemini/candidate/resume in Settings, then run DRAFT → TEST → LIVE.

## Verification status

- Backend: **148 unit tests pass**; DB-integration/route tests gated (`RUN_DB_TESTS=1`). `tsc`
  clean, production build + ESM entrypoint load verified.
- Frontend: `tsc` clean, `vite build` succeeds, smoke test passes.
- End-to-end (login → import → DRAFT → logs/analytics) should be run once against your database.

## Documentation

- [docs/API.md](docs/API.md) — endpoint reference
- [CHECKLIST.md](CHECKLIST.md) — command checklist
- [docs/superpowers/specs/2026-06-18-job-application-platform-design.md](docs/superpowers/specs/2026-06-18-job-application-platform-design.md) — design spec
- [docs/superpowers/plans/2026-06-18-job-application-platform.md](docs/superpowers/plans/2026-06-18-job-application-platform.md) — implementation plan
