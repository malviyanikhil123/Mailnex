import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { normalize, type RawJob } from '../autopilot/normalize.js';

/** Reads the country again for everything already stored, using the improved word list. */
const rows = await pool.query<{ id: number; title: string; location: string | null; company_name: string; url: string; source_key: string }>(
  `SELECT id, title, location, company_name, url, source_key FROM autopilot_jobs WHERE country = 'unknown'`,
);

let fixed = 0;
for (const r of rows.rows) {
  const again = normalize({ title: r.title, companyName: r.company_name, location: r.location, url: r.url, sourceKey: r.source_key } as RawJob);
  if (again.country !== 'unknown') {
    await pool.query('UPDATE autopilot_jobs SET country = $1, remote = $2 WHERE id = $3', [again.country, again.remote, r.id]);
    fixed++;
  }
}
log.info({ wereUnknown: rows.rows.length, nowPlaced: fixed, stillUnknown: rows.rows.length - fixed }, 'countries read again');
await closeDb();
