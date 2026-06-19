# Final Project Checklist

## Backend

| Step | Command |
|------|---------|
| Install | `cd backend && npm install` |
| Environment setup | `cp .env.example .env` then fill `DB_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (32 chars) |
| Database configuration | Set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` in `.env`; create the DB: `CREATE DATABASE email_automation;` |
| Generate migration (only if schema changed) | `npm run db:generate` |
| Run migrations | `npm run db:migrate` |
| Seed (admin, settings, 10 templates) | `npm run db:seed` |
| Development start | `npm run dev`  → http://localhost:4000 |
| Type check | `npm run build` (tsc) or `npx tsc --noEmit` |
| Unit tests | `npm test` |
| DB integration tests (opt-in) | `RUN_DB_TESTS=1 DB_HOST=... DB_PORT=... DB_USERNAME=... DB_PASSWORD=... DB_DATABASE=... npm test` |
| Production build | `npm run build` |
| Production start | `npm start` |

## Frontend

| Step | Command |
|------|---------|
| Install | `cd frontend && npm install` |
| Environment setup | `cp .env.example .env` then set `VITE_API_URL=http://localhost:4000` |
| Development start | `npm run dev`  → http://localhost:5173 |
| Type check | `npm run lint` (tsc) |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |

## Docker (full stack)

| Step | Command |
|------|---------|
| Configure | `cp .env.example .env` (root) → set `DB_USERNAME/DB_PASSWORD/DB_DATABASE`, JWT secrets, `ENCRYPTION_KEY` |
| Build + run | `docker compose up --build` |
| URLs | frontend :8080 · backend :4000 · postgres :5432 |

## Post-deploy configuration (dashboard)

1. Log in with the seeded admin: `admin@local` / `Admin@123` (then change it).
2. Settings → Gmail: address + App Password.
3. Settings → Gemini: API key (optional).
4. Settings → Candidate Profile: name, phone, email, role, experience, skills, links.
5. Settings → Resume: upload `resume.pdf`.
6. Settings → Campaign: daily limit, sending window, test email.
7. Campaign: DRAFT → review Logs → TEST → LIVE.
