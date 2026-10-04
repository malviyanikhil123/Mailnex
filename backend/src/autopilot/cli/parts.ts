import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { breakUp, saveParts } from '../autopilot/parts.js';

/** Cuts a person's resume into pieces, ready for tailoring. Run once after onboarding. */
const who = Number(process.argv[2] ?? 0);
const people = await pool.query<{ user_id: number; full_name: string; resume_text: string }>(
  who
    ? 'SELECT user_id, full_name, resume_text FROM autopilot_profiles WHERE user_id = $1'
    : 'SELECT user_id, full_name, resume_text FROM autopilot_profiles WHERE user_id IS NOT NULL',
  who ? [who] : [],
);

for (const person of people.rows) {
  if (!person.resume_text) {
    log.warn({ person: person.full_name }, 'no resume stored for this person');
    continue;
  }
  const parts = await breakUp(person.resume_text);
  const count = await saveParts(person.user_id, parts);
  log.info({
    person: person.full_name, pieces: count,
    roles: parts.jobs.length, projects: parts.projects.length, skills: parts.skills.length,
  }, 'resume broken into pieces');
}

await closeDb();
