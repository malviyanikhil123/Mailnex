import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { env, roles } from '../shared/env.js';
import { matchesRole, roleWords, isFresh, type NormalJob } from '../autopilot/normalize.js';

/**
 * Goes back over the jobs already stored and tags which are your family of work,
 * using exactly the same rules as a fresh hunt. Nothing is deleted; stale adverts
 * are only reported, so you can decide.
 */
const WORDS = roleWords(roles);
const rows = await pool.query<{ id: number; title: string; posted_at: string | null }>(
  'SELECT id, title, posted_at FROM autopilot_jobs',
);

const mine: number[] = [];
let stale = 0;
for (const r of rows.rows) {
  const asJob = { title: r.title, postedAt: r.posted_at ? new Date(r.posted_at) : null } as NormalJob;
  if (matchesRole(asJob, WORDS)) mine.push(r.id);
  if (!isFresh(asJob, env.JOB_MAX_AGE_DAYS)) stale++;
}

await pool.query('UPDATE autopilot_jobs SET role_match = false');
if (mine.length) await pool.query('UPDATE autopilot_jobs SET role_match = true WHERE id = ANY($1::int[])', [mine]);

log.info({ checked: rows.rows.length, yourRoles: mine.length, otherRoles: rows.rows.length - mine.length, olderThanCutoff: stale, cutoffDays: env.JOB_MAX_AGE_DAYS },
  'jobs re-tagged');
await closeDb();
