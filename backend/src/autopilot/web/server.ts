import express, { type Request } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../shared/db.js';
import { log } from '../shared/log.js';
import { signIn, signUp, mustBeSignedIn, type Me } from './auth.js';
import { readResume, workOutProfile, saveProfile, profileOf, applySettings } from '../autopilot/profile.js';
import { settingsOf, saveSettings, employersToAvoid, SettingsInput, ownRoles } from '../autopilot/settings.js';
import { whereForPerson } from '../autopilot/match.js';
import { recentRuns, nextDue, gapMinutes } from '../autopilot/schedule.js';
import { textFromFile } from '../autopilot/document.js';
import { byToken, decide, waitingFor } from '../autopilot/approve.js';
import { findWhatIsBlocking, needed, answer } from '../autopilot/accounts.js';

/**
 * Autopilot's own small web app. Found jobs are shared by everyone;
 * the profile and the search settings are per person. Nothing here applies to
 * anything — Phase 1 is looking only.
 */

const app = express();
// A pasted resume is bigger than the 100kb express allows by default.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const PORT = Number(process.env.PORT ?? 6002);
const FRONT_PORT = Number(process.env.FRONT_PORT ?? 6003);

/**
 * The page is served by its own small process on another port, so the two halves can be
 * restarted and later hosted apart. Browsers treat that as a different origin, so the
 * API has to say plainly which origin it trusts and that cookies are welcome.
 * Only localhost is ever allowed — this is a development convenience, not an open door.
 */
const TRUSTED = new Set([
  `http://localhost:${FRONT_PORT}`, `http://127.0.0.1:${FRONT_PORT}`,
  `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
  `http://localhost:6001`, `http://127.0.0.1:6001`,
  `http://localhost:5056`, `http://127.0.0.1:5056`,
]);

app.use((req, res, next) => {
  const from = req.headers.origin;
  if (from && TRUSTED.has(from)) {
    res.setHeader('access-control-allow-origin', from);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-allow-headers', 'content-type, x-file-name');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('vary', 'origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const of = (req: Request) => (req as Request & { me: Me }).me;
const week = 7 * 24 * 3600 * 1000;
const RESUME_LIMIT = 60_000;   // characters; longer than any real resume, short enough for the model

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password, please' });
  try {
    const out = await signIn(String(email), String(password));
    if (!out) return res.status(401).json({ error: 'That email and password do not match' });
    res.cookie('autopilot', out.token, { httpOnly: true, sameSite: 'lax', maxAge: week });
    res.json({ me: out.me });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not sign in' });
  }
});

// The one other door that is open to a stranger. The password is read straight
// out of the body into bcrypt and is never logged, kept, or echoed back.
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Your name, email and a password, please' });
  try {
    const out = await signUp(String(name), String(email), String(password));
    res.cookie('autopilot', out.token, { httpOnly: true, sameSite: 'lax', maxAge: week });
    res.json({ me: out.me });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create the account' });
  }
});

app.post('/api/logout', (_req, res) => { res.clearCookie('autopilot'); res.json({ ok: true }); });

// Everything below is yours alone: the user id comes from the signed cookie,
// never from the request, so there is no way to ask for somebody else's row.
app.get('/api/me', mustBeSignedIn, async (req, res) => {
  const me = of(req);
  const [profile, settings] = await Promise.all([profileOf(me.id), settingsOf(me.id)]);
  res.json({ me, profile, settings });
});

app.get('/api/settings', mustBeSignedIn, async (req, res) => {
  res.json({ settings: await settingsOf(of(req).id) });
});

app.put('/api/settings', mustBeSignedIn, async (req, res) => {
  const wanted = SettingsInput.safeParse(req.body ?? {});
  if (!wanted.success) {
    return res.status(400).json({ error: wanted.error.issues[0]?.message ?? 'Those settings do not look right' });
  }
  const me = of(req);
  const settings = await saveSettings(me.id, wanted.data);
  await applySettings(me.id, {
    targetRoles: settings.targetRoles,
    salaryFloor: settings.salaryFloor,
    salaryCurrency: settings.salaryCurrency,
    neverContact: employersToAvoid(settings),
  });
  res.json({ settings });
});

/**
 * Onboarding: paste the words of a resume and we fill in the profile.
 * Same reading and same rules as `pnpm run profile` — see src/autopilot/profile.ts.
 */
async function profileFromWords(me: Me, text: string, res: Parameters<typeof app.post>[1] extends never ? never : any) {
  try {
    const settings = await settingsOf(me.id);
    const facts = await readResume(text);
    const profile = workOutProfile(facts, text, {
      // Only roles this person picked themselves — never the .env defaults, which
      // belong to the owner and would put their work into a stranger's searches.
      extraRoles: await ownRoles(me.id),
      neverContact: employersToAvoid(settings),
      salaryFloor: settings.salaryFloor,
      salaryCurrency: settings.salaryCurrency,
    });
    await saveProfile({ userId: me.id, slug: `user-${me.id}` }, profile);
    // The roles read off the resume become the starting point for their searches.
    if (profile.targetRoles.length) await saveSettings(me.id, { targetRoles: profile.targetRoles });
    res.json({ profile: await profileOf(me.id), settings: await settingsOf(me.id) });
  } catch (err) {
    log.warn({ userId: me.id, why: err instanceof Error ? err.message : String(err) }, 'could not read a resume');
    res.status(502).json({ error: 'We could not read that resume just now. Try again in a moment.' });
  }
}

app.post('/api/profile/from-resume', mustBeSignedIn, async (req, res) => {
  const text = String(req.body?.resumeText ?? '').trim();
  if (text.length < 200) return res.status(400).json({ error: 'That is too short to be a resume — paste the whole thing' });
  if (text.length > RESUME_LIMIT) return res.status(400).json({ error: 'That is longer than we can read — paste the resume only, not a whole portfolio' });
  await profileFromWords(of(req), text, res);
});

/**
 * The same thing, but from an attached PDF, Word file or text file. The body is the
 * raw bytes, so there is no multipart parsing to go wrong; the browser sends the file
 * as it is and names it in the headers.
 */
app.post(
  '/api/profile/from-file',
  mustBeSignedIn,
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res) => {
    const me = of(req);
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const name = String(req.headers['x-file-name'] ?? '');
    try {
      const { text, kind } = await textFromFile(bytes, name, String(req.headers['content-type'] ?? ''));
      log.info({ userId: me.id, kind, characters: text.length }, 'read an attached resume');
      if (text.length > RESUME_LIMIT) return res.status(400).json({ error: 'That document is longer than we can read — attach the resume only' });
      await profileFromWords(me, text, res);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'We could not open that file' });
    }
  },
);

app.get('/api/stats', mustBeSignedIn, async (req, res) => {
  const settings = await settingsOf(of(req).id);
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  const clause = mine.length ? `WHERE ${mine.join(' AND ')}` : '';

  const [yours, whole, byCountry, bySource, recent] = await Promise.all([
    pool.query<{ n: number; today: number }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE first_seen_at > now() - interval '24 hours')::int AS today
         FROM autopilot_jobs ${clause}`, args),
    pool.query(`SELECT (SELECT count(*)::int FROM autopilot_jobs) AS pool,
                       (SELECT count(*)::int FROM autopilot_companies) AS companies,
                       (SELECT count(DISTINCT country)::int FROM autopilot_jobs WHERE country IS NOT NULL) AS countries`),
    pool.query(`SELECT COALESCE(country,'unknown') AS country, count(*)::int AS n
                  FROM autopilot_jobs ${clause} GROUP BY 1 ORDER BY n DESC LIMIT 12`, args),
    pool.query(`SELECT label, kind, found, added, last_result, last_run_at FROM autopilot_sources ORDER BY added DESC, found DESC LIMIT 40`),
    pool.query(`SELECT to_char(date_trunc('day', first_seen_at), 'DD Mon') AS day, count(*)::int AS n
                  FROM autopilot_jobs ${clause}${clause ? ' AND' : ' WHERE'} first_seen_at > now() - interval '14 days'
                 GROUP BY 1, date_trunc('day', first_seen_at) ORDER BY date_trunc('day', first_seen_at)`, args),
  ]);

  res.json({
    totals: { jobs: yours.rows[0]!.n, today: yours.rows[0]!.today, ...whole.rows[0] },
    byCountry: byCountry.rows, sources: bySource.rows, daily: recent.rows,
  });
});


app.get('/api/jobs', mustBeSignedIn, async (req, res) => {
  const me = of(req);
  const settings = await settingsOf(me.id);
  // Newest first by default; "best" puts the Fit Score on top, with unjudged jobs last.
  const sort = String(req.query.sort ?? '') === 'best'
    ? 's.score DESC NULLS LAST, COALESCE(j.posted_at, j.first_seen_at) DESC'
    : 'COALESCE(j.posted_at, j.first_seen_at) DESC';
  const q = String(req.query.q ?? '').trim();
  const country = String(req.query.country ?? '').trim();
  const remote = String(req.query.remote ?? '') === '1';
  const everything = String(req.query.everything ?? '') === '1';   // off by default: your roles only
  const days = Number(req.query.days ?? 0);
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);

  const where: string[] = [];
  const args: unknown[] = [];
  if (q) { args.push(`%${q}%`); where.push(`(title ILIKE $${args.length} OR company_name ILIKE $${args.length})`); }
  if (country) { args.push(country); where.push(`country = $${args.length}`); }
  if (remote) where.push('remote = true');
  // What counts as "your kind of role" is read from this person's own settings,
  // never from the shared role_match column, which only ever fitted the first user.
  where.push(...whereForPerson(settings, args, { everything, ignoreAge: days > 0 }));
  if (days > 0) where.push(`COALESCE(posted_at, first_seen_at) > now() - interval '${Number(days)} days'`);
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await pool.query(
    `SELECT j.id, j.title, j.company_name, j.location, j.country, j.remote, j.url, j.salary_text,
            j.source_key, j.posted_at, j.first_seen_at,
            s.score, s.verdict, s.confidence, s.summary, s.parts, s.knockouts
       FROM autopilot_jobs j
       LEFT JOIN autopilot_scores s ON s.job_id = j.id AND s.user_id = $${args.length + 1}
      ${filter}
      ORDER BY ${sort}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    [...args, me.id],
  );
  const count = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM autopilot_jobs j ${filter}`, args);
  const whole = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM autopilot_jobs');
  res.json({ jobs: rows.rows, total: count.rows[0]?.n ?? 0, pool: whole.rows[0]?.n ?? 0, page, limit });
});

/**
 * What the scheduler has been doing. The jobs found are shared by everyone, so these
 * runs are the same for everyone too — there is nothing personal in the rows.
 * The next times are worked out from .env here, because the scheduler is a separate
 * process and may not even be running; a timetable and no recent runs says exactly that.
 */
app.get('/api/runs', mustBeSignedIn, async (_req, res) => {
  res.json({ runs: await recentRuns(20), due: await nextDue(), everyMinutes: gapMinutes });
});

app.get('/api/countries', mustBeSignedIn, async (req, res) => {
  const settings = await settingsOf(of(req).id);
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  const rows = await pool.query(
    `SELECT DISTINCT country FROM autopilot_jobs
      WHERE country IS NOT NULL${mine.length ? ' AND ' + mine.join(' AND ') : ''} ORDER BY 1`, args);
  res.json(rows.rows.map((r: { country: string }) => r.country));
});


/* ---------------- Deciding on a job ----------------
 * These three answer to a token from an email rather than a signed-in session: the
 * decision has to be makeable from a phone, without logging in. The token is long,
 * random, good for one job and forty-eight hours, and dies the moment it is used.
 */

app.get('/approve/:token', async (req, res) => {
  const found = await byToken(String(req.params.token));
  if (!found) return res.status(404).json({ error: 'gone' });
  const { userId, ...rest } = found;          // the reader never needs the account id
  res.json(rest);
});

app.post('/approve/:token/decide', async (req, res) => {
  const wanted = String(req.body?.decision ?? '');
  if (!['approved', 'rejected', 'never'].includes(wanted)) {
    return res.status(400).json({ error: 'That is not a decision I know' });
  }
  const out = await decide(String(req.params.token), wanted as 'approved' | 'rejected' | 'never');
  if (!out.ok) return res.status(410).json({ error: 'That link has already been used, or it has expired' });

  log.info({ decision: wanted, company: out.companyName }, 'a decision was made');
  res.json({
    ok: true,
    said: wanted === 'approved'
      ? 'Saved. Nothing has been sent yet — applying is not switched on, so the documents are waiting for you in the dashboard.'
      : wanted === 'never'
        ? `${out.companyName} will not be shown to you again, and anything of theirs still waiting has been cleared.`
        : 'Rejected. It will not be raised again.',
  });
});

app.get('/approve/:token/resume.pdf', async (req, res) => {
  const found = await byToken(String(req.params.token));
  if (!found?.resumeHtml) return res.status(404).send('No resume was written for this one');
  // Served as a page rather than a file: the browser prints it, and there is no
  // temporary file to leave lying about.
  res.type('html').send(found.resumeHtml);
});

app.get('/api/waiting', mustBeSignedIn, async (req, res) => {
  res.json({ waiting: await waitingFor(of(req).id) });
});


/* ---------------- Sign-ups standing in the way ----------------
 * Nothing here creates an account anywhere. It counts what each missing sign-up is
 * costing in jobs, asks the person, and remembers the answer.
 */

app.get('/api/accounts', mustBeSignedIn, async (req, res) => {
  const me = of(req);
  const rows = await needed(me.id);
  const waiting = rows.filter((r) => r.state === 'asking');
  res.json({
    accounts: rows,
    blocked: waiting.reduce((sum, r) => sum + r.jobs_blocked, 0),
    waiting: waiting.length,
  });
});

app.post('/api/accounts/scan', mustBeSignedIn, async (req, res) => {
  const found = await findWhatIsBlocking(of(req).id);
  res.json({ found, accounts: await needed(of(req).id) });
});

app.post('/api/accounts/:id', mustBeSignedIn, async (req, res) => {
  const want = String(req.body?.state ?? '');
  if (!['approved', 'created', 'skipped'].includes(want)) {
    return res.status(400).json({ error: 'That is not an answer I understand' });
  }
  const ok = await answer(of(req).id, Number(req.params.id), want as 'approved' | 'created' | 'skipped');
  if (!ok) return res.status(404).json({ error: 'No such sign-up' });
  res.json({ ok: true, accounts: await needed(of(req).id) });
});

const candidateDirs = [
  fileURLToPath(new URL('../../../job-autopilot-frontend/public', import.meta.url)),
  fileURLToPath(new URL('../../../job-autopilot/public', import.meta.url)),
  fileURLToPath(new URL('../../public', import.meta.url)),
];
const publicDir = candidateDirs.find((d) => fs.existsSync(d)) ?? candidateDirs[0];
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

let serverInstance: any = null;

export function startAutopilotServer(port: number = PORT) {
  if (serverInstance) return serverInstance;
  serverInstance = app.listen(port, () => log.info({ url: `http://localhost:${port}` }, 'Autopilot web app is up'));
  return serverInstance;
}

export { app as autopilotApp };

// Auto-start when executed directly via tsx/node
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
) && process.argv[1].includes('autopilot');

if (isDirectRun) {
  startAutopilotServer(PORT);
}

