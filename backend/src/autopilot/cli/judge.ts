import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { settingsOf } from '../autopilot/settings.js';
import { whereForPerson } from '../autopilot/match.js';
import { readAdvert, scoreAgainst, saveScore, type Person } from '../autopilot/score.js';
import { fattenThinAdverts } from '../autopilot/advert.js';

/**
 * Gives every job that suits a person a Fit Score out of 100, with the reasons.
 * Nothing is applied to — this only sorts the pile so the good ones rise.
 *
 * Scoring costs an AI call per job, so a job is read once and then left alone unless
 * the advert itself changes. Run it after a hunt:  pnpm run judge
 */

const who = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 0);
const limit = Number(process.env.JUDGE_LIMIT ?? 60);
const again = process.argv.includes('again');

const everyone = { judged: 0, apply: 0, ask: 0, out: 0, skip: 0, failed: 0 };

const people = await pool.query<{ id: number }>(
  who ? 'SELECT user_id AS id FROM autopilot_profiles WHERE user_id = $1'
      : 'SELECT user_id AS id FROM autopilot_profiles WHERE user_id IS NOT NULL',
  who ? [who] : [],
);

if (!people.rows.length) {
  log.warn('nobody has a profile yet — run the resume step first');
  // The line the scheduler reads, so a run shows up with real numbers beside it.
log.info({ found: everyone.judged, added: everyone.apply + everyone.ask, ...everyone }, 'judging finished');

await closeDb();
  process.exit(0);
}

for (const person of people.rows) {
  const row = await pool.query<{
    full_name: string; skills: string[] | null; years_experience: string; seniority: string;
    degree_level: string; city: string | null; country: string | null; resume_text: string;
  }>(
    `SELECT full_name, skills, years_experience, seniority, degree_level, city, country, resume_text
       FROM autopilot_profiles WHERE user_id = $1`, [person.id],
  );
  const p = row.rows[0];
  if (!p) continue;

  const settings = await settingsOf(person.id);
  const me: Person = {
    fullName: p.full_name,
    skills: p.skills ?? [],
    years: Number(p.years_experience) || 0,
    seniority: p.seniority,
    degreeLevel: p.degree_level,
    city: p.city,
    country: p.country,
    resumeText: p.resume_text ?? '',
    // What they have actually worked in, taken from their own resume.
    domains: (p.resume_text ?? '').toLowerCase().match(/\b(fintech|banking|telecom|healthcare|e-?commerce|retail|insurance|logistics|edtech|saas|media|travel|gaming|energy)\b/g) ?? [],
  };

  // Only jobs this person would be shown anyway, newest first, and only ones not yet judged.
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  args.push(person.id);
  const notYet = again ? '' : `AND NOT EXISTS (SELECT 1 FROM autopilot_scores s WHERE s.job_id = j.id AND s.user_id = $${args.length})`;

  const jobs = await pool.query<{
    id: number; title: string; company_name: string; description: string | null;
    location: string | null; salary_text: string | null; country: string; posted_at: string | null;
  }>(
    `SELECT j.id, j.title, j.company_name, j.description, j.location, j.salary_text, j.country, j.posted_at
       FROM autopilot_jobs j
      WHERE ${mine.length ? mine.join(' AND ') : 'true'} ${notYet}
      ORDER BY COALESCE(j.posted_at, j.first_seen_at) DESC
      LIMIT ${Math.min(Math.max(limit, 1), 300)}`,
    args,
  );

  log.info({ person: p.full_name, toJudge: jobs.rows.length }, 'judging');

  // Aggregators only pass on a summary. Fetch the real advert first, or the score is
  // a guess dressed up as a number.
  await fattenThinAdverts(jobs.rows.map((j) => j.id));
  const full = await pool.query<{ id: number; description: string | null }>(
    'SELECT id, description FROM autopilot_jobs WHERE id = ANY($1::int[])', [jobs.rows.map((j) => j.id)]);
  const words = new Map(full.rows.map((r) => [r.id, r.description]));

  const tally = { apply: 0, ask: 0, skip: 0, out: 0, failed: 0 };

  for (const job of jobs.rows) {
    try {
      const read = await readAdvert({
        title: job.title, companyName: job.company_name, description: words.get(job.id) ?? job.description,
        location: job.location, salaryText: job.salary_text,
      });
      const s = scoreAgainst(me, read, settings, {
        title: job.title, companyName: job.company_name, country: job.country,
        postedAt: job.posted_at ? new Date(job.posted_at) : null,
      });
      await saveScore(person.id, job.id, s, read);

      if (s.verdict === 'apply') tally.apply++;
      else if (s.verdict === 'ask me') tally.ask++;
      else if (s.verdict === 'knocked out') tally.out++;
      else tally.skip++;

      if (s.score >= 70 || s.knockouts.length) {
        log.info({ score: s.score, verdict: s.verdict, job: job.title.slice(0, 48), at: job.company_name.slice(0, 24), why: s.summary.slice(0, 90) }, 'judged');
      }
    } catch (err) {
      tally.failed++;
      log.warn({ job: job.title.slice(0, 40), why: err instanceof Error ? err.message.slice(0, 120) : String(err) }, 'could not judge this one');
    }
  }

  everyone.judged += jobs.rows.length;
  everyone.apply += tally.apply;
  everyone.ask += tally.ask;
  everyone.out += tally.out;
  everyone.skip += tally.skip;
  everyone.failed += tally.failed;
  log.info({ person: p.full_name, ...tally }, 'done');
}

// The line the scheduler reads, so a run shows up with real numbers beside it.
log.info({ found: everyone.judged, added: everyone.apply + everyone.ask, ...everyone }, 'judging finished');

await closeDb();
