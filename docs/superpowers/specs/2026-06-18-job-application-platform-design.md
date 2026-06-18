# Automated Job Application Platform — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Goal

Import 23,800+ HR/recruiter contacts from Excel into PostgreSQL and automatically
send personalized job-application emails over time — at most 50/day, within a
09:00–18:00 window, at human-like random intervals, from a single Gmail account.
Gemini personalizes existing templates (it never writes whole emails). A React
dashboard manages contacts, templates, campaigns, logs, analytics, and settings.

## 2. Architecture

Monorepo with two fully independent apps:

```
email-automation/
├── backend/      Fastify + TypeScript + Drizzle + PostgreSQL
├── frontend/     React + TypeScript + Vite + Tailwind
├── docker-compose.yml
└── README.md
```

Backend uses clean layered architecture; dependencies point inward:

```
routes → controllers → services → repositories → db (Drizzle)
                          ↑
        scheduler/jobs, integrations (email provider, gemini, excel)
```

- **routes** — Fastify route registration + Zod schema binding only.
- **controllers** — HTTP concerns: parse request, set status codes, call a service.
- **services** — business logic (campaign engine, import, AI personalization, analytics, auth, settings).
- **repositories** — the only layer that touches Drizzle; one repo per aggregate.
- **scheduler/jobs** — node-cron tick + per-email send job.
- **integrations** — thin adapters behind interfaces (`EmailProvider`, `gemini.ts`, `excel.ts`) so they are swappable and testable.

### Backend folder structure
```
backend/src/
├── modules/            (feature modules group route+controller+service+repo+schema)
│   ├── auth/
│   ├── contacts/
│   ├── templates/
│   ├── campaign/
│   ├── logs/
│   ├── analytics/
│   └── settings/
├── scheduler/          cron registration + tick
├── jobs/               sendEmail job, generateDailyQueue job
├── db/
│   ├── schema/         drizzle table definitions
│   ├── migrations/
│   ├── seed/
│   └── index.ts        drizzle client
├── integrations/
│   ├── email/          EmailProvider interface + GmailProvider
│   ├── gemini/
│   └── excel/
├── middleware/         auth guard, error handler, rate limit
├── config/             env loading (Zod), constants
├── utils/              crypto (AES-256-GCM), logger (pino), validators
├── types/
└── server.ts / app.ts
```

### Frontend folder structure
```
frontend/src/
├── pages/        Login, Dashboard, Contacts, Templates, Campaign, Logs, Analytics, Settings
├── components/   table, charts, forms, modals, toasts
├── layouts/      AppLayout (sidebar + topbar), AuthLayout
├── services/     axios client + api modules per domain
├── hooks/        react-query hooks
├── routes/       router + protected route
├── store/        zustand (auth, theme)
├── utils/
└── types/
```

## 3. Data Model (Drizzle / PostgreSQL)

### Enums
- `contact_status`: `PENDING, PROCESSING, SENT, FAILED, BOUNCED, PAUSED`
- `log_status`: `GENERATED, SENT, FAILED, BOUNCED, RETRY_SCHEDULED, SKIPPED`
- `failure_type`: `TEMPORARY, PERMANENT`
- `campaign_mode`: `DRAFT, TEST, LIVE`
- `campaign_state`: `IDLE, RUNNING, PAUSED, STOPPED`
- `queue_status`: `SCHEDULED, PROCESSING, DONE, CANCELLED`

### Tables

**contacts** — `id, companyName, location, email (unique, citext), contactPerson, status (default PENDING), retryCount (default 0), nextRetryAt, lastContactedAt, sentAt, createdAt, updatedAt`

**contacts_imports** — `id, fileName, totalRows, importedRows, skippedRows, duplicateRows, invalidRows, createdAt`
> Import-history table; surfaced on the dashboard.

**email_templates** — `id, name, subject, body, category, version (default 1), active (default true), createdAt, updatedAt`

**email_logs** — `id, contactId (fk), templateId (fk), subject, body, mode, status, failureType, errorCode, errorMessage, retryCount, nextRetryAt, aiUsed (bool), sentAt, createdAt`

**campaign_settings** (single row) — `id, mode (default DRAFT), state (default IDLE), dailyLimit (default 50), startHour (default 9), endHour (default 18), testEmail, enabled (default false), updatedAt`

**campaign_queue** — `id, contactId (fk), scheduledAt, status (default SCHEDULED), createdAt`
> Persistent daily send schedule. Survives server restarts; the cron tick reads
> due rows from here rather than from memory.

**daily_quota** — `id, date (unique), emailsSent (default 0)`

**app_settings** — keyed config rows persisted in DB, bootstrapped from env on first
boot. Holds Gmail (email, encrypted appPassword), Gemini (encrypted apiKey),
active email provider name, and the candidate profile (see §7).

**users** — `id, name, email (unique), passwordHash, refreshToken (hashed), createdAt, updatedAt`

Secrets (Gmail app password, Gemini API key) are encrypted at rest with
**AES-256-GCM** using a key derived from `ENCRYPTION_KEY` env var, and are never
returned in plaintext through the API (write-only fields).

## 4. Campaign Engine & Failure Handling

### Daily queue generation
On campaign start and at the start of each new day (cron), generate
`remainingQuota` rows in `campaign_queue` with `scheduledAt` spread randomly
across `[startHour, endHour]` with randomized gaps + jitter (human-like, no two
identical times). Queue is persisted, so a restart resumes the same schedule.

### Cron tick (every minute)
If `state = RUNNING`, current time is within the window, quota remains, and a
queue row is due (`scheduledAt <= now`, `status = SCHEDULED`):
1. Select one eligible contact (skip `SENT/BOUNCED/PROCESSING`; skip contacts with `nextRetryAt > now`).
2. Mark contact `PROCESSING` and queue row `PROCESSING`.
3. Personalize (Gemini or fallback) → send via `EmailProvider` → log → update status, quota, queue row `DONE`.
One email at a time; never simultaneous.

### Campaign modes
- **DRAFT** — generate subject+body, write `email_logs` (status `GENERATED`), do **not** send.
- **TEST** — send every email to `campaign_settings.testEmail` only; real contacts untouched.
- **LIVE** — send to the real contact.

### Failure classification (`classifyFailure`)
Pluggable classifier mapping a send error to `TEMPORARY` or `PERMANENT`:
- **TEMPORARY** — SMTP 4xx, network timeout, `ECONNRESET/ETIMEDOUT`, Gemini unavailable.
- **PERMANENT** — SMTP 5xx, invalid recipient, "no such user/mailbox", domain not found.

### Failure handling
- **Temporary** → `retryCount++`, set `nextRetryAt` by schedule **(retry 1: +1h, retry 2: +6h, retry 3: +24h)**, log `RETRY_SCHEDULED`. After 3 retries → contact `FAILED`.
- **Permanent** → contact `BOUNCED`, never retried, excluded from all future selection.
- **Gmail daily limit reached** → auto-pause campaign (`state = PAUSED`); **do not** change contact status; auto-resume next day via the tick. Logged distinctly.
- **Gemini fallback** → key missing/quota exceeded → interpolate template (`{{company}}`, `{{location}}`) with no AI, `aiUsed = false`, send proceeds.

> **Bounce-detection limitation:** true bounces are asynchronous (arrive as inbox
> replies later). Without an IMAP poller we classify only the *synchronous* SMTP
> response at send time. The classifier is pluggable so an IMAP bounce-poller can
> be added later without touching the engine. This limitation is documented in the README.

### Duplicate protection
Unique email constraint + status check + "prior SENT log exists?" check before every send.

## 5. AI Personalization (Gemini)

Input: `companyName, location, selectedTemplate, candidateProfile`. Gemini ONLY:
personalizes greeting, rewrites the opening paragraph, generates a unique subject
line, adds slight wording variation, mentions company/location naturally, keeps it
concise and professional. Output: `{ personalizedSubject, personalizedBody }`,
stored in `email_logs`. On failure → template fallback (§4).

## 6. Email Provider Abstraction (future-proofing)

All sending goes through an `EmailProvider` interface — the rest of the system
never imports Gmail directly.

```ts
interface EmailProvider {
  name: string;
  verify(): Promise<void>;
  send(msg: OutgoingEmail): Promise<SendResult>; // SendResult carries provider code for classifyFailure
}
```

- **Current implementation:** `GmailProvider` (Nodemailer, Gmail SMTP, App Password, connection pooling, retry support).
- **Future:** Outlook, SendGrid, AWS SES — added by implementing the interface and registering in a provider factory keyed by `app_settings.emailProvider`.

## 7. Candidate Profile & Resume

Candidate profile stored in `app_settings`, fully editable from the Settings UI:
`Name, Phone, Email, Role, Experience, Skills[], LinkedIn, GitHub, Portfolio`,
plus a derived signature. Placeholder values are seeded; the user fills real
values via the dashboard (no source edits, no PII in repo).

**Resume** is uploaded through the dashboard (`POST /settings/resume`, multipart),
stored on disk under a configured uploads dir, path saved in `app_settings`, and
attached to every outgoing email. Replacing the resume = re-upload, no file swap.

## 8. API Contract

**Auth** — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
JWT access (15m) + rotating refresh (7d, hashed in DB). bcrypt passwords. All
non-auth routes behind a JWT preHandler.

**Contacts** — `POST /contacts/import` (multipart Excel), `GET /contacts`
(search/filter/paginate), `GET /contacts/:id`, `DELETE /contacts/:id`,
`GET /contacts/import/:jobId/progress`, `GET /contacts/imports` (history).

**Templates** — full CRUD + `POST /templates/:id/preview`.

**Campaign** — `POST /campaign/start|pause|resume|stop`, `PATCH /campaign/mode`, `GET /campaign/status`.

**Logs** — `GET /logs` with `?status=failed|sent|bounced` + search.

**Analytics** — `GET /analytics/dashboard`, `/analytics/daily`, `/analytics/monthly`.

**Settings** — `PATCH /settings/gmail|gemini|campaign|candidate`, `POST /settings/resume`. Secrets are write-only.

### Excel import pipeline
ExcelJS streaming read → per-row Zod + email validation → skip invalid → dedup
against DB → chunked bulk insert (~1k/chunk, `onConflictDoNothing`) → write a
`contacts_imports` summary row. Progress tracked in an in-memory job map, polled
via the progress endpoint. Handles 20,000+ rows.

## 9. Analytics

Dashboard exposes: Total Contacts, Pending, Sent, Failed, Bounced, Emails Sent
Today, Success Rate, Failure Rate, **Total Imported Contacts, Total Emails
Generated, Total Emails Sent, Total Bounced, Total Failed, AI Personalization
Usage %, Average Emails Per Day**, plus Daily / Weekly / Monthly trends and
import history. Recharts on the frontend.

## 10. Frontend

Vite + Tailwind. Zustand for auth/theme; React Query for server state; Axios with
a refresh-retry interceptor; React Hook Form + Zod for forms; Recharts for charts.
Pages: Login, Dashboard, Contacts, Templates, Campaign, Logs, Analytics, Settings.
Sidebar navigation, dark mode, loading/error states, toast notifications,
responsive layout.

## 11. Security

`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, Zod validation on every
input, input sanitization, encrypted secrets, env-driven config, `.env.example`
files for both apps.

## 12. Docker & Seeds

- Backend Dockerfile (multi-stage build), frontend Dockerfile (build → nginx).
- `docker-compose.yml`: postgres + backend + frontend; run migrations + seed on boot.
- Seeds: 10 templates (Software Developer, Backend Developer, Node.js Developer,
  Full Stack Developer, MERN Stack Developer categories), one admin user, default
  `campaign_settings`, and candidate-profile placeholders.

## 13. Build Sequence

Backend fully (DB → auth → import → templates → AI → provider → scheduler →
campaign → logs → analytics → settings), verified end-to-end, then frontend
against the running API. Each phase from the implementation plan.

## 13a. Deferred to v2 (forward-compatible)

Multi-campaign support (`campaigns` + `campaign_contacts` tables) is **out of scope
for v1** — v1 is single-campaign by design (one `campaign_settings` row, one
`campaign_queue`). The seam is kept clean so v2 is additive, not a rewrite:
`email_logs` and `campaign_queue` already carry `contactId`, `templateId`, and
`mode`, so v2 can introduce a `campaigns` table, backfill one default campaign,
and add a nullable `campaignId` FK (plus a `campaign_contacts` join table:
`id, campaignId, contactId, status, sentAt, createdAt`) without altering existing
behavior. This enables multiple campaigns, per-campaign templates, follow-ups, and
per-campaign analytics later.

## 14. Environment Variables

**Backend:** `DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY,
GMAIL_EMAIL, GMAIL_APP_PASSWORD, GEMINI_API_KEY, PORT, UPLOAD_DIR`
**Frontend:** `VITE_API_URL`
