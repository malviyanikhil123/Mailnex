import { readFile } from 'node:fs/promises';
import { pool, closeDb } from '../shared/db.js';

/**
 * Walks a brand-new person all the way through: create an account, attach a resume,
 * have it read, set up searches, then look at the jobs they are shown.
 *
 * It runs as a stranger would — over HTTP, with a cookie — so it exercises the real
 * app rather than the functions behind it. Every account it makes is deleted at the end,
 * whether the run passed or failed.
 */

const BASE = process.env.WEB_URL ?? 'http://localhost:5055';
const HERE = new URL('.', import.meta.url);

type Person = {
  label: string;
  file: string;            // fixture to attach
  name: string;
  expectName: string;      // what the AI should read off the page
  expectRoleWord: string;  // a word that must appear in the roles it works out
  countries: string[];
  wrongRoleWord: string;   // a role that must NOT dominate their results
};

const PEOPLE: Person[] = [
  {
    label: 'software engineer',
    file: 'swe',
    name: 'Priya Ramanathan',
    expectName: 'priya',
    expectRoleWord: 'engineer',
    countries: ['in', 'remote'],
    wrongRoleWord: 'business analyst',
  },
  {
    label: 'ai engineer',
    file: 'ai',
    name: 'Daniel Osei',
    expectName: 'daniel',
    expectRoleWord: 'engineer',
    countries: ['gb', 'remote'],
    wrongRoleWord: 'business analyst',
  },
];

const FORMATS = ['pdf', 'docx', 'txt'] as const;

type Check = { name: string; ok: boolean; detail: string };

const made: string[] = [];       // emails to clear up afterwards
let jar = '';

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(jar ? { cookie: jar } : {}) },
    // Reading a resume goes out to an AI, which can be slow; waiting four minutes is
    // fine, hanging for ever is not.
    signal: AbortSignal.timeout(240_000),
  });
  const set = res.headers.get('set-cookie');
  if (set) jar = set.split(';')[0]!;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function check(list: Check[], name: string, ok: boolean, detail = ''): void {
  list.push({ name, ok, detail });
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function runOnce(person: Person, format: string, pass: number): Promise<Check[]> {
  const checks: Check[] = [];
  jar = '';
  const email = `flowtest-${person.file}-${format}-${pass}-${Date.now()}@example.invalid`;
  console.log(`\n-- ${person.label} · ${format} · pass ${pass}`);

  // 1. sign up
  const up = await call('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: person.name, email, password: 'a-long-enough-password' }),
  });
  made.push(email);
  check(checks, 'account created', up.status === 200 && up.body?.me?.email === email, `status ${up.status}`);
  if (up.status !== 200) return checks;

  // 2. a stranger must not be able to see anyone else's things
  const meFirst = await call('/api/me');
  check(checks, 'starts with no profile of their own', meFirst.body?.profile == null,
    meFirst.body?.profile ? `saw ${meFirst.body.profile.full_name}` : 'none, as expected');

  // 3. attach the resume as a real file
  const bytes = await readFile(new URL(`fixtures/${person.file}.${format}`, HERE));
  const type = format === 'pdf' ? 'application/pdf'
    : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'text/plain';
  const read = await call('/api/profile/from-file', {
    method: 'POST',
    headers: { 'content-type': type, 'x-file-name': `${person.file}.${format}` },
    body: new Uint8Array(bytes),
  });
  const profile = read.body?.profile;
  check(checks, `${format} was read`, read.status === 200, read.status === 200 ? '' : JSON.stringify(read.body).slice(0, 120));
  if (read.status !== 200) return checks;

  check(checks, 'read the right person off the page',
    String(profile?.full_name ?? '').toLowerCase().includes(person.expectName),
    `got "${profile?.full_name}"`);

  const roles: string[] = profile?.target_roles ?? [];
  check(checks, 'worked out their line of work',
    roles.some((r) => r.toLowerCase().includes(person.expectRoleWord)),
    roles.slice(0, 4).join(', '));

  check(checks, 'no pay floor invented', profile?.salary_floor == null,
    profile?.salary_floor ? `invented ${profile.salary_floor}` : 'none, as expected');

  // 4. set up their searches
  const put = await call('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ countries: person.countries, maxAgeDays: 45 }),
  });
  check(checks, 'search settings saved', put.status === 200 &&
    JSON.stringify(put.body?.settings?.countries) === JSON.stringify(person.countries),
    JSON.stringify(put.body?.settings?.countries));

  // 5. the jobs they are shown
  const jobs = await call('/api/jobs?limit=50');
  const list: Array<{ title: string; country: string }> = jobs.body?.jobs ?? [];
  check(checks, 'a job list comes back', jobs.status === 200 && Array.isArray(list), `status ${jobs.status}`);
  check(checks, 'the list is not empty', list.length > 0, `${jobs.body?.total ?? 0} matching`);

  const wrong = list.filter((j) => j.title.toLowerCase().includes(person.wrongRoleWord)).length;
  check(checks, 'not shown somebody else\'s line of work', wrong === 0,
    wrong ? `${wrong} of ${list.length} were ${person.wrongRoleWord}` : `0 of ${list.length}`);

  const right = list.filter((j) => j.title.toLowerCase().includes(person.expectRoleWord)).length;
  check(checks, 'the jobs match what they do', list.length === 0 || right / list.length >= 0.6,
    `${right} of ${list.length} say "${person.expectRoleWord}"`);

  const outside = list.filter((j) => j.country && j.country !== 'unknown' && !person.countries.includes(j.country));
  check(checks, 'nothing outside their countries', outside.length === 0,
    outside.length ? outside.slice(0, 3).map((j) => j.country).join(', ') : person.countries.join(', '));

  // 6. the overview agrees with the list
  const stats = await call('/api/stats');
  check(checks, 'overview counts agree', stats.status === 200 && stats.body?.totals?.jobs === jobs.body?.total,
    `overview ${stats.body?.totals?.jobs} vs list ${jobs.body?.total}`);

  // 7. signing out really does shut the door
  await call('/api/logout', { method: 'POST' });
  const after = await call('/api/me');
  check(checks, 'signed out means locked out', after.status === 401, `status ${after.status}`);

  return checks;
}

async function cleanUp(): Promise<void> {
  if (!made.length) return;
  const ids = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = ANY($1::text[])', [made]);
  const list = ids.rows.map((r: { id: number }) => r.id);
  if (list.length) {
    await pool.query('DELETE FROM autopilot_profiles WHERE user_id = ANY($1::int[])', [list]);
    await pool.query('DELETE FROM autopilot_user_settings WHERE user_id = ANY($1::int[])', [list]);
    await pool.query('DELETE FROM autopilot_users WHERE user_id = ANY($1::int[])', [list]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [list]);
  }
  console.log(`\nCleaned up ${list.length} test account(s).`);
}

/* ---------------------------------------------------------------- */

const wanted = Number(process.env.PASSES ?? 3);
const onlyFormat = process.env.FORMAT;
const formats = onlyFormat ? [onlyFormat] : [...FORMATS];

const results: Array<{ person: string; format: string; pass: number; checks: Check[] }> = [];

try {
  for (const person of PEOPLE) {
    for (const format of formats) {
      for (let pass = 1; pass <= wanted; pass++) {
        const checks = await runOnce(person, format, pass);
        results.push({ person: person.label, format, pass, checks });
      }
    }
  }
} finally {
  await cleanUp();
}

console.log('\n================ SUMMARY ================');
let failed = 0;
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok);
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${r.person} · ${r.format} · pass ${r.pass}  (${r.checks.length - bad.length}/${r.checks.length})`);
  for (const b of bad) console.log(`        ${b.name} — ${b.detail}`);
}
console.log(`\n${results.length} runs, ${failed} failed checks.`);
await closeDb();
process.exitCode = failed ? 1 : 0;
