import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { countries } from '../shared/env.js';

/**
 * Nothing is deleted — the pool is shared. This only untags jobs that sit outside
 * the countries you chose, so they stop showing up as "your kind of role".
 */
const r = await pool.query(
  `UPDATE autopilot_jobs SET role_match = false
    WHERE role_match AND country <> 'unknown' AND country <> ALL($1::text[])`,
  [countries],
);
const left = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM autopilot_jobs WHERE role_match');
log.info({ untagged: r.rowCount, yourRolesNow: left.rows[0]!.n, yourCountries: countries.length }, 'tidied');
await closeDb();
