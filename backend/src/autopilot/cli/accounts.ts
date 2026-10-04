import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { findWhatIsBlocking, needed } from '../autopilot/accounts.js';

/** Works out which sign-ups are blocking jobs, for everyone with a profile. */
const who = Number(process.argv[2] ?? 0);
const people = await pool.query<{ user_id: number; full_name: string }>(
  who ? 'SELECT user_id, full_name FROM autopilot_profiles WHERE user_id = $1'
      : 'SELECT user_id, full_name FROM autopilot_profiles WHERE user_id IS NOT NULL',
  who ? [who] : [],
);

for (const person of people.rows) {
  await findWhatIsBlocking(person.user_id);
  const rows = await needed(person.user_id, 'asking');
  log.info({
    person: person.full_name,
    signUpsNeeded: rows.length,
    jobsBlocked: rows.reduce((n, r) => n + r.jobs_blocked, 0),
    worstFirst: rows.slice(0, 5).map((r) => `${r.label} (${r.jobs_blocked})`),
  }, 'what is standing in the way');
}

await closeDb();
