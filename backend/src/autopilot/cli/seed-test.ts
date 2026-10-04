import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { readResume, workOutProfile, saveProfile } from '../autopilot/profile.js';
import { saveSettings } from '../autopilot/settings.js';

/**
 * Two accounts to try the app with, each set up from a made-up resume.
 *
 * They are for looking at the product through someone else's eyes: a software engineer
 * and an AI engineer see quite different job lists from the same shared pool.
 * Both are invented people at @example.invalid, which can never reach anybody.
 *
 * Run again at any time — it rebuilds them from scratch.
 * Remove them with: pnpm run seed:test -- remove
 */

const PEOPLE = [
  { name: 'Priya Ramanathan', email: 'priya@example.invalid', password: 'priya-test-2026', fixture: 'swe', countries: ['in', 'remote'] },
  { name: 'Daniel Osei', email: 'daniel@example.invalid', password: 'daniel-test-2026', fixture: 'ai', countries: ['gb', 'ie', 'de', 'remote'] },
];

async function forget(email: string): Promise<void> {
  const found = await pool.query<{ id: number }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  const id = found.rows[0]?.id;
  if (!id) return;
  await pool.query('DELETE FROM autopilot_profiles WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM autopilot_user_settings WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM autopilot_users WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

const removing = process.argv.slice(2).includes('remove');

for (const person of PEOPLE) {
  await forget(person.email);
  if (removing) {
    log.info({ email: person.email }, 'test account removed');
    continue;
  }

  const made = await pool.query<{ id: number }>(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [person.name, person.email, await bcrypt.hash(person.password, 12)],
  );
  const id = made.rows[0]!.id;
  await pool.query('INSERT INTO autopilot_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);

  // Their searches come from their own resume, exactly as they would after signing up.
  const fixtureCandidates = [
    new URL(`../test/fixtures/${person.fixture}.txt`, import.meta.url),
    new URL(`../../test/fixtures/${person.fixture}.txt`, import.meta.url),
  ];
  const fixtureUrl = fixtureCandidates.find((u) => fs.existsSync(fileURLToPath(u))) ?? fixtureCandidates[0];
  const resume = await readFile(fixtureUrl, 'utf8');
  const facts = await readResume(resume);
  const profile = workOutProfile(facts, resume, { extraRoles: [], neverContact: [], salaryFloor: null, salaryCurrency: null });
  await saveProfile({ userId: id, slug: `user-${id}` }, profile);
  await saveSettings(id, { targetRoles: profile.targetRoles, countries: person.countries, maxAgeDays: 45 });

  const shown = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM autopilot_jobs
      WHERE title ILIKE ANY($1::text[]) AND (country = ANY($2::text[]) OR country = 'unknown')`,
    [profile.targetRoles.map((r) => `%${r.toLowerCase()}%`), person.countries],
  );

  log.info({
    signIn: person.email,
    password: person.password,
    readAs: profile.fullName,
    roles: profile.targetRoles.slice(0, 4),
    countries: person.countries,
    jobsWaiting: shown.rows[0]!.n,
  }, 'test account ready');
}

await closeDb();
