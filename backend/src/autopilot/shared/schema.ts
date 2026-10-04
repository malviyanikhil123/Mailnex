import { pgTable, serial, text, integer, timestamp, jsonb, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

/**
 * Autopilot's own tables. Mailnex's tables are never touched or renamed;
 * everything here is prefixed so both apps can share one database.
 * Phase 1 covers finding jobs only — scoring and applying tables come later.
 */

export const sources = pgTable('autopilot_sources', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),                       // 'greenhouse', 'remotive', 'linkedin-alert'…
  label: text('label').notNull(),
  kind: text('kind').notNull(),                     // 'api' | 'feed' | 'ats' | 'alert-email' | 'crawler'
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastResult: text('last_result'),                  // 'ok' or a short reason it failed
  found: integer('found').notNull().default(0),     // jobs seen on the last run
  added: integer('added').notNull().default(0),     // new jobs kept on the last run
  pausedUntil: timestamp('paused_until', { withTimezone: true }),
}, (t) => ({ keyIdx: uniqueIndex('autopilot_sources_key_idx').on(t.key) }));

export const companies = pgTable('autopilot_companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),                     // lower-case, punctuation removed — used for matching
  website: text('website'),
  atsKind: text('ats_kind'),                        // 'greenhouse' | 'lever' | 'ashby'…
  atsSlug: text('ats_slug'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ slugIdx: uniqueIndex('autopilot_companies_slug_idx').on(t.slug) }));

export const jobs = pgTable('autopilot_jobs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id),
  title: text('title').notNull(),
  companyName: text('company_name').notNull(),
  location: text('location'),
  country: text('country'),                         // 'in', 'gb', 'remote'…
  remote: boolean('remote').notNull().default(false),
  description: text('description'),                 // full text when the source gives it
  url: text('url').notNull(),
  applyKind: text('apply_kind'),                    // 'greenhouse' | 'lever' | 'email' | 'easy-apply'…
  salaryText: text('salary_text'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  roleMatch: boolean('role_match').notNull().default(false),   // is this your family of work?
  sourceKey: text('source_key').notNull(),
  sourceJobId: text('source_job_id'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),  // kept so parsing can be re-run without re-crawling
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  urlIdx: uniqueIndex('autopilot_jobs_url_idx').on(t.url),
  seenIdx: index('autopilot_jobs_first_seen_idx').on(t.firstSeenAt),
  countryIdx: index('autopilot_jobs_country_idx').on(t.country),
}));

export const fingerprints = pgTable('autopilot_job_fingerprints', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),       // company + title + location, normalised
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ fpIdx: uniqueIndex('autopilot_job_fingerprints_fp_idx').on(t.fingerprint) }));

export const events = pgTable('autopilot_events', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  agent: text('agent').notNull(),                   // 'Scout' | 'Cleaner' | 'Judge'…
  message: text('message').notNull(),               // plain English, no personal data
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ atIdx: index('autopilot_events_at_idx').on(t.at) }));

export const profiles = pgTable('autopilot_profiles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),                     // 'me' — one row per person, normally just you
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  city: text('city'),
  country: text('country'),
  targetRoles: jsonb('target_roles').$type<string[]>(),
  seniority: text('seniority'),                     // 'junior' | 'mid' | 'senior'
  yearsExperience: text('years_experience'),        // kept as text so "2.3" stays exact
  degree: text('degree'),
  degreeLevel: text('degree_level'),                // 'bachelor' | 'master' | 'none'
  gradYear: integer('grad_year'),
  skills: jsonb('skills').$type<string[]>(),
  salaryFloor: integer('salary_floor'),             // null = no salary rule, nothing dropped for pay
  salaryCurrency: text('salary_currency'),
  salaryNote: text('salary_note'),
  knockouts: jsonb('knockouts').$type<Record<string, unknown>>(),
  neverContact: jsonb('never_contact').$type<string[]>(),
  resumeText: text('resume_text'),                  // the original words, used for scoring
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ slugIdx: uniqueIndex('autopilot_profiles_slug_idx').on(t.slug) }));

/**
 * Mailnex owns `users`; we only point at it. The flag for "this person may use
 * Autopilot" lives here, in our own table, so Mailnex's table is never altered.
 */
export const autopilotUsers = pgTable('autopilot_users', {
  userId: integer('user_id').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  role: text('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

/**
 * What each person is looking for. Jobs are fetched once into one shared pool,
 * so these only decide what a person is shown — two people never cause two sweeps.
 * A missing row means "has not been asked yet"; the .env defaults stand in.
 */
export const userSettings = pgTable('autopilot_user_settings', {
  userId: integer('user_id').primaryKey(),
  targetRoles: jsonb('target_roles').$type<string[]>(),
  countries: jsonb('countries').$type<string[]>(),       // 'in', 'gb', 'remote'…
  maxAgeDays: integer('max_age_days'),                   // adverts older than this are stale
  salaryFloor: integer('salary_floor'),                  // null = no salary rule
  salaryCurrency: text('salary_currency'),
  currentEmployer: text('current_employer'),             // commas between names — never show these
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per scheduled run, written by `pnpm run schedule`.
 * This is the owner's proof that the thing is working while nobody is watching:
 * a run that never started leaves no row, and a run that fell over leaves ok = false.
 */
export const runs = pgTable('autopilot_runs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),                     // 'hunt' | 'inbox'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),   // null while it is still going
  ok: boolean('ok').notNull().default(false),       // false until it finishes cleanly
  found: integer('found').notNull().default(0),
  added: integer('added').notNull().default(0),
  note: text('note'),                               // why it failed, or what it skipped
}, (t) => ({ startedIdx: index('autopilot_runs_started_idx').on(t.startedAt) }));

export const scores = pgTable('autopilot_scores', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  jobId: integer('job_id').notNull(),
  score: integer('score').notNull(),
  verdict: text('verdict').notNull(),           // 'apply' | 'ask me' | 'skip' | 'knocked out'
  confidence: text('confidence').notNull(),
  summary: text('summary'),
  parts: jsonb('parts').$type<Array<{ part: string; got: number; of: number; why: string }>>(),
  knockouts: jsonb('knockouts').$type<string[]>(),
  reading: jsonb('reading').$type<Record<string, unknown>>(),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ personJob: uniqueIndex('autopilot_scores_person_job_idx').on(t.userId, t.jobId) }));

export const resumeParts = pgTable('autopilot_resume_parts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  kind: text('kind').notNull(),                 // 'job' | 'project' | 'skill' | 'education' | 'course'
  heading: text('heading').notNull(),
  org: text('org'),
  place: text('place'),
  started: text('started'),
  ended: text('ended'),
  bullets: jsonb('bullets').$type<string[]>(),  // the resume's own words, kept exactly
  tags: jsonb('tags').$type<string[]>(),
  rank: integer('rank').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tailored = pgTable('autopilot_tailored', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  jobId: integer('job_id').notNull(),
  resumeHtml: text('resume_html'),
  resumePdfPath: text('resume_pdf_path'),
  coverLetter: text('cover_letter'),
  answers: jsonb('answers').$type<Record<string, string>>(),
  changes: jsonb('changes').$type<string[]>(),
  gaps: jsonb('gaps').$type<string[]>(),
  madeAt: timestamp('made_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ personJob: uniqueIndex('autopilot_tailored_person_job_idx').on(t.userId, t.jobId) }));
