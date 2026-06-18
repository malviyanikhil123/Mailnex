# API Reference

Base URL: `http://localhost:4000`. All routes except `/health` and `/auth/login` /
`/auth/refresh` require `Authorization: Bearer <accessToken>`. Inputs are Zod-validated;
validation errors return `400 { error: "ValidationError", details }`. Secrets are write-only.

## Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken, user }` (rotates refresh) |
| POST | `/auth/logout` | — (auth) | `{ ok: true }` |
| GET | `/auth/me` | — (auth) | `{ id, name, email }` |

Access token TTL 15m; refresh token TTL 7d, rotated on each refresh and stored bcrypt-hashed.

## Contacts

| Method | Path | Notes |
|--------|------|-------|
| POST | `/contacts/import` | multipart `file` (xlsx); returns `202 { jobId }`, imports async |
| GET | `/contacts/import/:jobId/progress` | `{ processed, total, done, summary? }` |
| GET | `/contacts/imports` | `{ imports: ImportSummary[] }` |
| GET | `/contacts` | query `search, status, page, limit` → `{ rows, total, page, limit }` |
| GET | `/contacts/:id` | single contact |
| DELETE | `/contacts/:id` | `{ deleted: true }` |

Excel columns: `companyName, location, email`. Invalid emails skipped; duplicates (in-file and
vs DB) de-duplicated; summary persisted to `contacts_imports`.

## Templates

| Method | Path | Notes |
|--------|------|-------|
| GET | `/templates` | list |
| POST | `/templates` | `{ name, subject, body, category?, active? }` → `201`; `409` on duplicate (name, category) |
| GET | `/templates/:id` | single |
| PUT | `/templates/:id` | partial update; `version` auto-increments; `409` on duplicate |
| DELETE | `/templates/:id` | `{ deleted: true }` |
| POST | `/templates/:id/preview` | body = vars object → `{ subject, body }` (interpolated) |

Placeholders: `{{company}}`, `{{location}}`, `{{candidateName}}`, `{{signature}}`.

## Campaign

| Method | Path | Notes |
|--------|------|-------|
| POST | `/campaign/start` | state → RUNNING, builds today's queue |
| POST | `/campaign/pause` | state → PAUSED |
| POST | `/campaign/resume` | state → RUNNING |
| POST | `/campaign/stop` | state → STOPPED, cancels scheduled queue |
| PATCH | `/campaign/mode` | `{ mode: "DRAFT"|"TEST"|"LIVE" }` |
| GET | `/campaign/status` | `{ state, mode, quotaToday, dailyLimit, nextScheduledAt, countsByStatus }` |

## Logs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/logs` | query `status=sent|failed|bounced`, `search`, `page`, `limit` → `{ logs, total, page, limit }` |

Each log: `status, company/email, subject, mode, failureType, errorMessage, retryCount, nextRetryAt, aiUsed, sentAt, createdAt`.

## Analytics

| Method | Path | Response |
|--------|------|----------|
| GET | `/analytics/dashboard` | totals, pending/sent/failed/bounced, emailsSentToday, success/failure rate, totalImported, totalGenerated/Sent/Bounced/Failed, aiUsagePercent, averageEmailsPerDay, importHistory |
| GET | `/analytics/daily?days=14` | `{ trends: [{ bucket, sent, failed }] }` |
| GET | `/analytics/monthly?months=12` | `{ trends: [{ bucket, sent, failed }] }` |

## Settings

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/settings` | — | public view: booleans + candidate + resume filename + campaign (no secrets) |
| PATCH | `/settings/gmail` | `{ email, appPassword }` | app password encrypted at rest |
| PATCH | `/settings/gemini` | `{ apiKey }` | encrypted at rest |
| PATCH | `/settings/candidate` | partial `CandidateProfile` | merged with existing |
| PATCH | `/settings/campaign` | `{ mode?, dailyLimit?, startHour?, endHour?, testEmail?, enabled?, emailProvider? }` | `startHour < endHour` |
| POST | `/settings/resume` | multipart `file` (pdf) | stored in `UPLOAD_DIR`, attached to every email |

## Health

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `{ status: "ok" }` |
