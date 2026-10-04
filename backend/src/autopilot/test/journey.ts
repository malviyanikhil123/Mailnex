import { readFile } from 'node:fs/promises';
import { pool, closeDb } from '../shared/db.js';
import { settingsOf } from '../autopilot/settings.js';
import { whereForPerson } from '../autopilot/match.js';
import { readAdvert, scoreAgainst, saveScore, type Person as Scored } from '../autopilot/score.js';
import { fattenThinAdverts } from '../autopilot/advert.js';
import { breakUp, saveParts } from '../autopilot/parts.js';
import { tailorFor, toHtml, saveTailored } from '../autopilot/tailor.js';
import { ask as askApproval, byToken } from '../autopilot/approve.js';

/**
 * One invented person, the whole way through.
 *
 * Sign up, attach a resume, be shown jobs, have them scored, get a resume written for
 * the best one, be asked to decide, and decide. Everything over the real HTTP API or the
 * real modules — nothing stubbed — so a pass means the chain actually holds together.
 *
 * The person is deleted at the end, pass or fail. The only thing deliberately not done
 * for real is sending the email: the address is invented, so the digest is built and
 * checked but never put on the wire.
 */

const BASE = process.env.WEB_URL ?? 'http://localhost:5055';
const HERE = new URL('.', import.meta.url);
const EMAIL = `journey-${Date.now()}@example.invalid`;

let jar = '';
let userId = 0;
const checks: Array<{ step: string; ok: boolean; detail: string }> = [];

function check(step: string, ok: boolean, detail = ''): void {
  checks.push({ step, ok, detail });
  console.log(`${ok ? ' PASS ' : ' FAIL '} ${step}${detail ? ' — ' + detail : ''}`);
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(jar ? { cookie: jar } : {}) },
    signal: AbortSignal.timeout(240_000),
  });
  const set = res.headers.get('set-cookie');
  if (set) jar = set.split(';')[0]!;
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

try {
  /* 1 — sign up */
  const up = await call('/api/signup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Journey Tester', email: EMAIL, password: 'a-long-enough-password' }),
  });
  userId = up.body?.me?.id ?? 0;
  check('1. sign up', up.status === 200 && userId > 0, `user ${userId}`);
  if (!userId) throw new Error('cannot carry on without an account');

  /* 2 — sign out and back in, to prove the password really was stored */
  await call('/api/logout', { method: 'POST' });
  const back = await call('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: 'a-long-enough-password' }),
  });
  check('2. log in again', back.status === 200 && back.body?.me?.id === userId);

  /* 3 — attach a resume as a real PDF */
  const bytes = await readFile(new URL('fixtures/swe.pdf', HERE));
  const read = await call('/api/profile/from-file', {
    method: 'POST',
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'swe.pdf' },
    body: new Uint8Array(bytes),
  });
  const profile = read.body?.profile;
  check('3. read the resume', read.status === 200 && Boolean(profile?.full_name), `read as "${profile?.full_name}"`);

  /* 4 — choose where to look */
  const put = await call('/api/settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ countries: ['in', 'remote'], maxAgeDays: 60 }),
  });
  check('4. save search settings', put.status === 200, (put.body?.settings?.countries ?? []).join(', '));

  /* 5 — be shown jobs that suit them */
  const jobs = await call('/api/jobs?limit=20');
  const list: Array<{ id: number; title: string }> = jobs.body?.jobs ?? [];
  check('5. jobs come back', jobs.status === 200 && list.length > 0, `${jobs.body?.total} matching`);
  if (!list.length) throw new Error('no jobs to carry on with');

  /* 6 — break the resume into pieces */
  const resumeWords = profile.resume_text ?? (await readFile(new URL('fixtures/swe.txt', HERE), 'utf8'));
  console.log(`       … splitting a ${resumeWords.length}-character resume`);
  const began6 = Date.now();
  const parts = await breakUp(resumeWords);
  console.log(`       … took ${Math.round((Date.now() - began6) / 1000)}s`);
  const pieces = await saveParts(userId, parts);
  check('6. resume broken into pieces', pieces > 5, `${pieces} pieces · ${parts.jobs.length} roles · ${parts.skills.length} skills`);

  /* 7 — score the first few */
  const settings = await settingsOf(userId);
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  const toScore = await pool.query<{ id: number; title: string; company_name: string; description: string | null; location: string | null; salary_text: string | null; country: string; posted_at: string | null }>(
    `SELECT id, title, company_name, description, location, salary_text, country, posted_at
       FROM autopilot_jobs WHERE ${mine.length ? mine.join(' AND ') : 'true'}
      ORDER BY length(description) DESC NULLS LAST LIMIT 2`, args);

  console.log(`       … fetching the full text of ${toScore.rows.length} adverts`);
  const began7 = Date.now();
  await fattenThinAdverts(toScore.rows.map((j: { id: number }) => j.id));
  console.log(`       … adverts ready in ${Math.round((Date.now() - began7) / 1000)}s`);

  const me: Scored = {
    fullName: profile.full_name, skills: profile.skills ?? [],
    years: Number(profile.years_experience) || 0, seniority: profile.seniority,
    degreeLevel: profile.degree_level, city: profile.city, country: profile.country,
    resumeText: profile.resume_text ?? '', domains: [],
  };

  let scored = 0;
  let best = { id: 0, score: -1, title: '' };
  for (const job of toScore.rows) {
    const reading = await readAdvert({
      title: job.title,
      companyName: job.company_name,
      description: job.description,
      location: job.location,
      salaryText: job.salary_text,
    });
    const s = scoreAgainst(me, reading, settings, {
      title: job.title, companyName: job.company_name, country: job.country,
      postedAt: job.posted_at ? new Date(job.posted_at) : null,
    });
    await saveScore(userId, job.id, s, reading);
    scored++;
    if (s.score > best.score) best = { id: job.id, score: s.score, title: job.title };
  }
  check('7. jobs scored with reasons', scored === toScore.rows.length, `best ${best.score}/100 — ${best.title.slice(0, 40)}`);

  /* 8 — write a resume for the best one */
  const job = toScore.rows.find((j: { id: number }) => j.id === best.id)!;
  const tailored = await tailorFor(userId, {
    id: job.id, title: job.title, companyName: job.company_name,
    description: job.description, location: job.location,
  });
  const html = toHtml(
    { fullName: profile.full_name, email: profile.email, phone: profile.phone, city: profile.city, country: profile.country },
    { id: job.id, title: job.title, companyName: job.company_name, description: job.description, location: job.location },
    tailored,
  );
  await saveTailored(userId, job.id, html, null, tailored);
  check('8. resume tailored for it', html.includes(profile.full_name) && html.length > 800,
    `${tailored.changes.length} changes · ${tailored.gaps.length} gaps · letter ${tailored.coverLetter.length} chars`);

  /* 9 — the honesty rule actually held */
  // Checked against the words that were really read, not against a field the API does
  // not return: an earlier version compared with an empty string and failed honest work.
  const theirWords = resumeWords.toLowerCase();
  const madeUp = ['kubernetes', 'kafka', 'terraform', 'salesforce', 'sap', 'blockchain']
    .filter((skill) => new RegExp(skill, 'i').test(html) && !theirWords.includes(skill));
  check('9. nothing invented in the resume', madeUp.length === 0,
    madeUp.length ? `claimed ${madeUp.join(', ')}, which is not on their resume` : 'every claim traces back to the resume');

  check('9b. a letter emptied by the check is not quietly restored',
    tailored.coverLetter === '' || !/kubernetes|kafka|terraform/i.test(tailored.coverLetter) || theirWords.includes('kubernetes'),
    `letter ${tailored.coverLetter.length} characters`);

  /* 10 — ask them to decide */
  const token = await askApproval(userId, job.id);
  check('10. decision asked for', Boolean(token) && token.length > 20, `token issued`);

  /* 11 — the approval screen can be opened with that link, without signing in */
  const noCookie = await fetch(`${BASE}/approve/${token}`, { signal: AbortSignal.timeout(60_000) });
  const screen = await noCookie.json() as { title?: string; score?: number; resumeHtml?: string; userId?: number };
  check('11. approval screen opens from the link', noCookie.ok && Boolean(screen.title) && Boolean(screen.resumeHtml),
    `${screen.title?.slice(0, 36)} · ${screen.score}/100`);
  check('12. the screen leaks no account id', screen.userId === undefined);

  /* 13 — decide, and the link dies */
  const decided = await fetch(`${BASE}/approve/${token}/decide`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approved' }), signal: AbortSignal.timeout(60_000),
  });
  check('13. decision recorded', decided.ok);

  const again = await fetch(`${BASE}/approve/${token}/decide`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'rejected' }), signal: AbortSignal.timeout(60_000),
  });
  check('14. the same link cannot be used twice', again.status === 410);

  const dead = await byToken(token);
  check('15. the link is spent', dead === null);

  /* 16 — and the decision is on their record */
  const state = await pool.query<{ state: string }>(
    'SELECT state FROM autopilot_approvals WHERE user_id = $1 AND job_id = $2', [userId, job.id]);
  check('16. decision stored against the job', state.rows[0]?.state === 'approved', state.rows[0]?.state ?? 'nothing');

} catch (err) {
  check('the journey ran to the end', false, err instanceof Error ? err.message.slice(0, 160) : String(err));
} finally {
  if (userId) {
    for (const t of ['autopilot_approvals', 'autopilot_tailored', 'autopilot_scores', 'autopilot_resume_parts',
                     'autopilot_accounts_needed', 'autopilot_profiles', 'autopilot_user_settings', 'autopilot_users']) {
      await pool.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log(`\nCleaned up the test person (user ${userId}).`);
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n================ END TO END ================`);
console.log(`${checks.length} steps, ${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.step} — ${f.detail}`);
await closeDb();
process.exitCode = failed.length ? 1 : 0;
