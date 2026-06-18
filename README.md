# Automated Job Application Platform

Import 23,800+ recruiter contacts from Excel and automatically send Gemini-personalized
job-application emails over time — capped at 50/day within a 09:00–18:00 window, at
human-like random intervals, from a single Gmail account. Managed through a React dashboard.

- **Backend:** Node 20+, TypeScript, Fastify, PostgreSQL, Drizzle ORM, Nodemailer, Gemini, ExcelJS, node-cron, JWT, Zod, Pino
- **Frontend:** React, TypeScript, Vite, Tailwind, React Query, Axios, React Hook Form, Zod, Recharts, Zustand

## Monorepo layout

```
backend/    Fastify API + scheduler (clean layered architecture)
frontend/   React + Vite dashboard
docs/        design spec, implementation plan, API reference
docker-compose.yml
```

## Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 16 (local, hosted, or via the provided docker-compose)
- A Gmail account with an **App Password** (for sending) — configured in the UI, not in code
- A Google **Gemini API key** (optional — without it, emails fall back to raw templates)

## Quick start (Docker, full stack)

```bash
cp backend/.env.example .env        # edit secrets (JWT_SECRET, ENCRYPTION_KEY, ...)
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- Postgres: localhost:5432

The backend container runs migrations + seeds automatically on boot.

## Local development

**Backend**
```bash
cd backend
cp .env.example .env                 # set DATABASE_URL + secrets
npm install
npm run db:generate                  # (already generated; regenerate if schema changes)
npm run db:migrate                   # apply migrations to your Postgres
npm run db:seed                      # seed admin, settings, 10 templates
npm run dev                          # http://localhost:4000
npm test                             # unit tests (DB-integration tests are gated)
```

**Frontend**
```bash
cd frontend
cp .env.example .env                 # set VITE_API_URL=http://localhost:4000
npm install
npm run dev                          # http://localhost:5173
```

## Default credentials

After seeding, log in with:

- **Email:** `admin@local`
- **Password:** `Admin@123`

Change this immediately in a real deployment.

## Configure at runtime (Settings page)

All operational secrets and the candidate profile are **edited from the dashboard**, not
hardcoded. Secrets are encrypted at rest (AES-256-GCM) and never returned in plaintext.

1. **Gmail** — your Gmail address + a [Gmail App Password](https://support.google.com/accounts/answer/185833).
2. **Gemini** — your Gemini API key (optional).
3. **Campaign** — daily limit (default 50), sending window (09–18), test email, provider.
4. **Candidate Profile** — name, phone, email, role, experience, skills, LinkedIn, GitHub, portfolio.
5. **Resume** — upload your `resume.pdf`; it is attached to every email.

## How sending works

- **Modes:** `DRAFT` (generate + log only, no send — the default until you go live),
  `TEST` (send only to your configured test email), `LIVE` (send to real contacts).
- A persistent **`campaign_queue`** schedules each day's sends at randomized times within the
  window — it survives restarts. A node-cron tick sends **at most one email per minute**.
- **Retries (temporary failures only):** +1h, +6h, +24h, then marked `FAILED`.
- **Permanent failures** (bad recipient, domain not found) → `BOUNCED`, never retried.
- **Gmail daily limit reached** → the campaign auto-pauses and auto-resumes the next day;
  affected contacts stay `PENDING` (not failed).
- **Gemini** only *personalizes* an existing template (greeting, opening, subject). If the key
  is missing or the call fails, it falls back to the interpolated template (`aiUsed=false`).

### Bounce-detection limitation

True bounces are asynchronous (they arrive in your inbox later). Without an IMAP poller this
system classifies failures only from the **synchronous SMTP response** at send time. The
classifier is pluggable, so an IMAP bounce-poller can be added later without touching the engine.

## Environment variables

**Backend** (`backend/.env`)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | token signing secrets |
| `ENCRYPTION_KEY` | 32-char key for AES-256-GCM secret encryption |
| `GMAIL_EMAIL` / `GMAIL_APP_PASSWORD` | bootstrap Gmail creds (or set via Settings) |
| `GEMINI_API_KEY` | bootstrap Gemini key (or set via Settings) |
| `PORT` | API port (default 4000) |
| `UPLOAD_DIR` | resume + import temp file dir |

**Frontend** (`frontend/.env`): `VITE_API_URL`

## API

See [docs/API.md](docs/API.md) for the full endpoint reference.

## Verification status

- Backend: **147 unit tests pass**; DB-integration and route tests are written but **gated**
  (run with `RUN_DB_TESTS=1` against a real PostgreSQL). `npm run build` + ESM entrypoint load verified.
- Frontend: `tsc` clean, `vite build` succeeds, smoke test passes.
- End-to-end (login → import → DRAFT campaign → logs/analytics) should be run once against your
  hosted database after providing `DATABASE_URL`.

## Documentation

- [docs/superpowers/specs/2026-06-18-job-application-platform-design.md](docs/superpowers/specs/2026-06-18-job-application-platform-design.md) — design spec
- [docs/superpowers/plans/2026-06-18-job-application-platform.md](docs/superpowers/plans/2026-06-18-job-application-platform.md) — implementation plan
