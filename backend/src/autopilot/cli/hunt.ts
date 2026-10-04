import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env, has, countries as ownCountries, roles as ownRoles } from '../shared/env.js';
import { pool } from '../shared/db.js';
import { log } from '../shared/log.js';
import { closeDb } from '../shared/db.js';
import { normalize, wanted, isBlocked, slugify, matchesRole, roleWords, isFresh, type RawJob } from '../autopilot/normalize.js';
import { storeJobs, recordRun } from '../autopilot/store.js';
import * as feeds from '../autopilot/sources/feeds.js';
import { hiringCafe, browserReady } from '../autopilot/sources/browser.js';

/**
 * The Scout. Runs every source that is switched on, turns what comes back into
 * one shape, filters to the chosen countries, removes duplicates and stores the rest.
 * Phase 1: nothing is scored and nothing is applied to.
 */

type Task = { key: string; label: string; kind: string; run: () => Promise<RawJob[]> };

const companiesPathCandidates = [
  new URL('../data/companies.json', import.meta.url),
  new URL('../../../data/companies.json', import.meta.url),
  new URL('../../data/companies.json', import.meta.url),
];
const companiesUrl = companiesPathCandidates.find((u) => fs.existsSync(fileURLToPath(u))) ?? companiesPathCandidates[0];

const companies: Array<{ name: string; ats: string; board: string }> = JSON.parse(
  await readFile(companiesUrl, 'utf8'),
);

const tasks: Task[] = [
  { key: 'remotive', label: 'Remotive', kind: 'feed', run: async () => (await Promise.all(ROLES.map((r: string) => feeds.remotive(r)))).flat() },
  { key: 'remoteok', label: 'RemoteOK', kind: 'feed', run: feeds.remoteok },
  { key: 'arbeitnow', label: 'Arbeitnow (EU)', kind: 'feed', run: feeds.arbeitnow },
  { key: 'himalayas', label: 'Himalayas', kind: 'feed', run: feeds.himalayas },
  { key: 'jobicy', label: 'Jobicy', kind: 'feed', run: feeds.jobicy },
  { key: 'weworkremotely', label: 'We Work Remotely', kind: 'feed', run: feeds.weWorkRemotely },
];

for (const c of companies) {
  const fn = c.ats === 'greenhouse' ? feeds.greenhouse : c.ats === 'lever' ? feeds.lever : c.ats === 'ashby' ? feeds.ashby : null;
  if (!fn) continue;
  tasks.push({ key: `${c.ats}:${c.board}`, label: `${c.name} (${c.ats})`, kind: 'ats', run: () => fn(c.board, c.name) });
}

/**
 * What to search for, across everybody.
 *
 * The pool is shared, so the hunt has to cover every person's line of work, not just the
 * owner's — otherwise a software engineer who signs up would be fed business analyst
 * jobs for ever. Roles and countries are the union of what people have asked for, with
 * the .env values as the starting point for the owner.
 */
const theirSettings = await pool.query<{ target_roles: string[] | null; countries: string[] | null }>(
  'SELECT target_roles, countries FROM autopilot_user_settings',
);

const ROLES = [...new Set([
  ...ownRoles,
  ...theirSettings.rows.flatMap((r) => r.target_roles ?? []),
].map((r) => r.toLowerCase().trim()).filter(Boolean))].slice(0, 24);

const countries = [...new Set([
  ...ownCountries,
  ...theirSettings.rows.flatMap((r) => r.countries ?? []),
].filter(Boolean))];

const WORDS = roleWords(ROLES);
const BLOCKED = (env.CURRENT_EMPLOYER ?? '').split(',').map((c) => slugify(c)).filter(Boolean);

// hiring.cafe refuses plain server-side requests, so it only works if a real Chromium
// is on this machine. If it is not, say so once and carry on without it.
if (await browserReady()) {
  for (const role of ROLES) {
    tasks.push({
      key: `hiring-cafe-${role.toLowerCase().replace(/\s+/g, '-')}`,
      label: `hiring.cafe "${role}"`,
      kind: 'browser',
      run: () => hiringCafe(role, 5),
    });
  }
} else {
  log.warn('hiring.cafe is off — run "pnpm run browser:install" to fetch the Chromium it needs');
}

if (has.adzuna) {
  for (const country of countries.filter((c) => c !== 'remote' && c !== 'all')) {
    tasks.push({
      key: `adzuna-${country}`,
      label: `Adzuna ${country.toUpperCase()}`,
      kind: 'api',
      run: async () => (await Promise.all(ROLES.map((r) => feeds.adzuna(env.ADZUNA_APP_ID!, env.ADZUNA_APP_KEY!, country, r)))).flat(),
    });
  }
} else {
  log.warn('Adzuna is off — add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env to switch it on');
}

if (has.jooble) {
  // Jooble searches by keyword, so this is where your own kind of role actually turns up.
  // Cities as well as countries: Jooble returns far more for a named city.
  const PLACES = [
    // Jooble matches on "City, Country" — a bare city name returns nothing.
    'India', 'Mumbai, India', 'Bangalore, India', 'Hyderabad, India', 'Pune, India',
    'Gurgaon, India', 'Noida, India', 'Chennai, India', 'Ahmedabad, India', 'Jaipur, India',
    'Singapore', 'Dubai, United Arab Emirates', 'Abu Dhabi, United Arab Emirates',
    'Germany', 'Berlin, Germany', 'Munich, Germany',
    'Netherlands', 'Amsterdam, Netherlands', 'France', 'Paris, France',
    'United Kingdom', 'London, United Kingdom', 'Ireland', 'Dublin, Ireland',
    'Poland', 'Spain', 'Portugal', 'Sweden', 'Switzerland',
    'South Africa', 'Kenya', 'Nigeria', 'Egypt', 'Ghana',
    'Malaysia', 'Philippines', 'Vietnam', 'Indonesia', 'Thailand',
  ];
  // Asking for a place narrows Jooble hard — it holds thousands more with no place at all,
  // and our own country reading sorts them afterwards. So: one deep sweep per role,
  // then the per-place searches on top for anything local the sweep missed.
  for (const role of ROLES) {
    tasks.push({
      key: `jooble-open-${role.toLowerCase().replace(/\s+/g, '-')}`,
      label: `Jooble worldwide "${role}"`,
      kind: 'api',
      run: () => feeds.jooble(env.JOOBLE_API_KEY!, role, '', 12),
    });
  }

  for (const place of PLACES) {
    tasks.push({
      key: `jooble-${place.toLowerCase().replace(/[\s,]+/g, '-')}`,
      label: `Jooble ${place}`,
      kind: 'api',
      run: async () => (await Promise.all(ROLES.map((r) => feeds.jooble(env.JOOBLE_API_KEY!, r, place, 12)))).flat(),
    });
  }
} else {
  log.warn('Jooble is off — add JOOBLE_API_KEY to .env to switch it on');
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const chosen = only.length ? tasks.filter((t) => only.some((o) => t.key.includes(o) || t.kind === o)) : tasks;

log.info({
  searchingFor: ROLES.length + ' roles across ' + (theirSettings.rows.length || 1) + ' people',
  sources: chosen.length, countries: countries.length, roles: ROLES,
  maxAgeDays: env.JOB_MAX_AGE_DAYS, neverContact: env.CURRENT_EMPLOYER ?? 'none set',
}, 'hunt starting');

const totals = { found: 0, kept: 0, yourRoles: 0, tooOld: 0, added: 0, seenAgain: 0, duplicates: 0, failed: 0 };

for (const task of chosen) {
  try {
    const raw = await task.run();
    const all = raw.map(normalize);
    const blocked = all.filter((j) => isBlocked(j, BLOCKED));
    if (blocked.length) log.info({ source: task.label, blocked: blocked.length, employer: env.CURRENT_EMPLOYER }, 'skipped your own employer');
    // In your countries, not your own employer, and the advert is still recent.
    // Keep your countries — and also keep a job whose country we could not read,
    // as long as it is your line of work. Throwing those away lost real jobs.
    const here = all
      .map((j) => ({ ...j, roleMatch: matchesRole(j, WORDS) }))
      .filter((j) => !isBlocked(j, BLOCKED) && (wanted(j, countries) || (j.country === 'unknown' && j.roleMatch)));
    const tooOld = here.length - here.filter((j) => isFresh(j, env.JOB_MAX_AGE_DAYS)).length;
    // Everything recent is stored so the pool serves everyone, but each job is
    // tagged with whether it is your family of work — that is what you see first.
    const kept = here.filter((j) => isFresh(j, env.JOB_MAX_AGE_DAYS));
    const mine = kept.filter((j) => j.roleMatch).length;
    const stored = await storeJobs(kept);
    await recordRun(task.key, task.label, task.kind, raw.length, stored.added, 'ok');

    totals.found += raw.length;
    totals.kept += kept.length;
    totals.yourRoles += mine;
    totals.tooOld += tooOld;
    totals.added += stored.added;
    totals.seenAgain += stored.seenAgain;
    totals.duplicates += stored.duplicates;

    if (raw.length) {
      log.info(
        { source: task.label, found: raw.length, recentAndInYourCountries: kept.length, yourRoles: mine, tooOld, new: stored.added, duplicate: stored.duplicates },
        'source done',
      );
    }
  } catch (err) {
    totals.failed++;
    const why = err instanceof Error ? err.message : String(err);
    await recordRun(task.key, task.label, task.kind, 0, 0, why.slice(0, 120));
    log.warn({ source: task.label, why }, 'source failed — carrying on');
  }
}

log.info(totals, 'hunt finished');
await closeDb();
