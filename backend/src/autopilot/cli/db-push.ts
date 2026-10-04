import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';

/**
 * Creates Autopilot's tables if they are not there yet.
 * Nothing here touches Mailnex's tables.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS autopilot_sources (
  id serial PRIMARY KEY,
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb,
  last_run_at timestamptz,
  last_result text,
  found integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  paused_until timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_sources_key_idx ON autopilot_sources (key);

CREATE TABLE IF NOT EXISTS autopilot_companies (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  website text,
  ats_kind text,
  ats_slug text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_companies_slug_idx ON autopilot_companies (slug);

CREATE TABLE IF NOT EXISTS autopilot_jobs (
  id serial PRIMARY KEY,
  company_id integer REFERENCES autopilot_companies(id),
  title text NOT NULL,
  company_name text NOT NULL,
  location text,
  country text,
  remote boolean NOT NULL DEFAULT false,
  description text,
  url text NOT NULL,
  apply_kind text,
  salary_text text,
  posted_at timestamptz,
  source_key text NOT NULL,
  source_job_id text,
  raw jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_jobs_url_idx ON autopilot_jobs (url);
CREATE INDEX IF NOT EXISTS autopilot_jobs_first_seen_idx ON autopilot_jobs (first_seen_at);
CREATE INDEX IF NOT EXISTS autopilot_jobs_country_idx ON autopilot_jobs (country);

CREATE TABLE IF NOT EXISTS autopilot_job_fingerprints (
  id serial PRIMARY KEY,
  job_id integer NOT NULL REFERENCES autopilot_jobs(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_job_fingerprints_fp_idx ON autopilot_job_fingerprints (fingerprint);

CREATE TABLE IF NOT EXISTS autopilot_events (
  id serial PRIMARY KEY,
  job_id integer REFERENCES autopilot_jobs(id) ON DELETE CASCADE,
  agent text NOT NULL,
  message text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS autopilot_events_at_idx ON autopilot_events (at);

CREATE TABLE IF NOT EXISTS autopilot_profiles (
  id serial PRIMARY KEY,
  slug text NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  city text,
  country text,
  target_roles jsonb,
  seniority text,
  years_experience text,
  degree text,
  degree_level text,
  grad_year integer,
  skills jsonb,
  salary_floor integer,
  salary_currency text,
  salary_note text,
  knockouts jsonb,
  never_contact jsonb,
  resume_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_profiles_slug_idx ON autopilot_profiles (slug);

-- Who may use Autopilot. Mailnex owns the users table and we never change it;
-- this is our own side table, so a login works in both apps but the flag is ours.
CREATE TABLE IF NOT EXISTS autopilot_users (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

-- Found jobs stay shared by everyone (one pool, no duplicate fetching).
-- Anything personal - your profile, later your scores and applications - carries a user_id.
ALTER TABLE autopilot_profiles ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS autopilot_profiles_slug_idx;
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_profiles_user_idx ON autopilot_profiles (user_id);

-- What each person is looking for. One row per person, made when they finish
-- onboarding; until then the defaults in .env stand in.
CREATE TABLE IF NOT EXISTS autopilot_user_settings (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_roles jsonb,
  countries jsonb,
  max_age_days integer,
  salary_floor integer,
  salary_currency text,
  current_employer text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE autopilot_jobs ADD COLUMN IF NOT EXISTS role_match boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS autopilot_jobs_role_match_idx ON autopilot_jobs (role_match);

-- One row per scheduled run, written by "pnpm run schedule". Nobody is watching while
-- these happen, so this is the only record that says whether they did.
CREATE TABLE IF NOT EXISTS autopilot_runs (
  id serial PRIMARY KEY,
  kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  found integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  note text
);
CREATE INDEX IF NOT EXISTS autopilot_runs_started_idx ON autopilot_runs (started_at);

-- One score per person per job, with the reasons kept beside the number so a score
-- can always be explained rather than trusted blindly.
CREATE TABLE IF NOT EXISTS autopilot_scores (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES autopilot_jobs(id) ON DELETE CASCADE,
  score integer NOT NULL,
  verdict text NOT NULL,
  confidence text NOT NULL,
  summary text,
  parts jsonb,
  knockouts jsonb,
  reading jsonb,
  scored_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_scores_person_job_idx ON autopilot_scores (user_id, job_id);
CREATE INDEX IF NOT EXISTS autopilot_scores_rank_idx ON autopilot_scores (user_id, score DESC);

-- The resume broken into pieces, so a tailored one can be assembled from what is true
-- rather than written from scratch. One set per person.
CREATE TABLE IF NOT EXISTS autopilot_resume_parts (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,                  -- 'job' | 'project' | 'skill' | 'education' | 'course'
  heading text NOT NULL,               -- job title, project name, skill name
  org text,                            -- employer, client, institution
  place text,
  started text,
  ended text,
  bullets jsonb,                       -- the lines exactly as the resume words them
  tags jsonb,                          -- tools and skills this piece demonstrates
  rank integer NOT NULL DEFAULT 0,     -- order in the original resume
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS autopilot_resume_parts_user_idx ON autopilot_resume_parts (user_id, kind);

-- One tailored set of documents per person per job. Nothing here is ever sent on its own.
CREATE TABLE IF NOT EXISTS autopilot_tailored (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES autopilot_jobs(id) ON DELETE CASCADE,
  resume_html text,
  resume_pdf_path text,
  cover_letter text,
  answers jsonb,                       -- why this company, notice period, expected salary
  changes jsonb,                       -- what was moved, dropped or reworded, for the side by side
  gaps jsonb,                          -- what the job wants that you do not have
  made_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_tailored_person_job_idx ON autopilot_tailored (user_id, job_id);

-- Every decision asked of a person, and what they said. The link in the email carries
-- a single-use token, so a decision can be made without signing in — and only once.
CREATE TABLE IF NOT EXISTS autopilot_approvals (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES autopilot_jobs(id) ON DELETE CASCADE,
  token text NOT NULL,
  state text NOT NULL DEFAULT 'waiting',   -- waiting | approved | rejected | never | expired
  note text,
  asked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_approvals_token_idx ON autopilot_approvals (token);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_approvals_person_job_idx ON autopilot_approvals (user_id, job_id);
CREATE INDEX IF NOT EXISTS autopilot_approvals_waiting_idx ON autopilot_approvals (user_id, state);

-- Companies a person never wants to hear from again.
CREATE TABLE IF NOT EXISTS autopilot_blocked_companies (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_slug text NOT NULL,
  company_name text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_blocked_idx ON autopilot_blocked_companies (user_id, company_slug);

-- Places that will not accept an application until there is an account. The row exists
-- so the person can be asked; nothing is ever created without their say-so.
CREATE TABLE IF NOT EXISTS autopilot_accounts_needed (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,              -- 'workday' | 'naukri' | 'linkedin' | 'icims'...
  label text NOT NULL,                 -- what to call it on screen
  scope text NOT NULL DEFAULT 'platform',  -- 'platform' or 'employer' (Workday is per employer)
  employer text,
  signup_url text,
  jobs_blocked integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'asking',    -- asking | approved | created | skipped
  can_we_create boolean NOT NULL DEFAULT false,
  note text,
  seen_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_accounts_needed_idx
  ON autopilot_accounts_needed (user_id, platform, COALESCE(employer, ''));
CREATE INDEX IF NOT EXISTS autopilot_accounts_state_idx ON autopilot_accounts_needed (user_id, state);

-- Each person reads their own inbox: their alerts land in their mailbox, not the owner's.
-- The app password is kept encrypted, never in plain text.
ALTER TABLE autopilot_user_settings ADD COLUMN IF NOT EXISTS gmail_email text;
ALTER TABLE autopilot_user_settings ADD COLUMN IF NOT EXISTS gmail_password_enc text;
`;

const who = await pool.query<{ db: string; usr: string; ver: string }>(
  `SELECT current_database() AS db, current_user AS usr, substring(version() from 'PostgreSQL [0-9.]+') AS ver`,
);
log.info({ database: who.rows[0]?.db, user: who.rows[0]?.usr, version: who.rows[0]?.ver }, 'connected');

await pool.query(DDL);

const tables = await pool.query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'autopilot_%' ORDER BY table_name`,
);
log.info({ tables: tables.rows.map((r) => r.table_name) }, 'autopilot tables ready');

const others = await pool.query<{ n: string }>(
  `SELECT count(*)::text AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name NOT LIKE 'autopilot_%'`,
);
log.info({ mailnexTablesUntouched: others.rows[0]?.n }, 'existing tables left alone');

await closeDb();
