import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { settingsOf } from '../autopilot/settings.js';
import { whereForPerson } from '../autopilot/match.js';
import { tailorFor, toHtml, saveTailored, type Person } from '../autopilot/tailor.js';
import { toPdf } from '../autopilot/pdf.js';

/**
 * Writes a tailored resume and cover letter for the jobs worth applying to.
 *
 * Nothing is sent. Each one is a set of documents waiting for you to look at, with a
 * plain list of what was changed and what the job wants that you have not got.
 *
 *   pnpm run tailor            the best few jobs for everyone with a profile
 *   pnpm run tailor 1          just that person
 *   pnpm run tailor 1 job 812  one job in particular
 */

const args = process.argv.slice(2);
const who = Number(args[0] ?? 0);
const oneJob = args[1] === 'job' ? Number(args[2]) : 0;
const howMany = Number(process.env.TAILOR_LIMIT ?? 5);

const people = await pool.query<{
  user_id: number; full_name: string; email: string | null; phone: string | null;
  city: string | null; country: string | null;
}>(
  who
    ? 'SELECT user_id, full_name, email, phone, city, country FROM autopilot_profiles WHERE user_id = $1'
    : 'SELECT user_id, full_name, email, phone, city, country FROM autopilot_profiles WHERE user_id IS NOT NULL',
  who ? [who] : [],
);

for (const row of people.rows) {
  const person: Person = {
    fullName: row.full_name, email: row.email, phone: row.phone, city: row.city, country: row.country,
  };

  const pieces = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM autopilot_resume_parts WHERE user_id = $1', [row.user_id]);
  if (!pieces.rows[0]!.n) {
    log.warn({ person: person.fullName }, 'resume not broken into pieces yet — run: pnpm run parts');
    continue;
  }

  // The ones worth the effort: judged well, not knocked out, and not already written.
  const settings = await settingsOf(row.user_id);
  const args2: unknown[] = [];
  const mine = whereForPerson(settings, args2);
  args2.push(row.user_id);
  const me = `$${args2.length}`;

  const jobs = await pool.query<{ id: number; title: string; company_name: string; description: string | null; location: string | null; score: number }>(
    oneJob
      ? `SELECT id, title, company_name, description, location, 0 AS score FROM autopilot_jobs WHERE id = ${Number(oneJob)}`
      : `SELECT j.id, j.title, j.company_name, j.description, j.location, s.score
           FROM autopilot_jobs j
           JOIN autopilot_scores s ON s.job_id = j.id AND s.user_id = ${me}
          WHERE ${mine.length ? mine.join(' AND ') : 'true'}
            AND s.verdict <> 'knocked out'
            AND NOT EXISTS (SELECT 1 FROM autopilot_tailored t WHERE t.job_id = j.id AND t.user_id = ${me})
          ORDER BY s.score DESC
          LIMIT ${Math.min(Math.max(howMany, 1), 25)}`,
    oneJob ? [] : args2,
  );

  log.info({ person: person.fullName, toWrite: jobs.rows.length }, 'tailoring');

  for (const job of jobs.rows) {
    const forTailoring = {
      id: job.id, title: job.title, companyName: job.company_name,
      description: job.description, location: job.location,
    };
    try {
      const t = await tailorFor(row.user_id, forTailoring);
      const html = toHtml(person, forTailoring, t);

      const name = `${person.fullName} — ${job.title} — ${job.company_name}`
        .replace(/[^\w\s—-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

      const folder = fileURLToPath(new URL('../../documents/', import.meta.url));
      await mkdir(folder, { recursive: true });
      await writeFile(`${folder}${name}.html`, html, 'utf8');
      const pdf = await toPdf(html, name);

      await saveTailored(row.user_id, job.id, html, pdf, t);
      log.info({
        job: job.title.slice(0, 44), at: job.company_name.slice(0, 24), score: job.score,
        changed: t.changes.length, gaps: t.gaps.length, pdf: pdf ? 'written' : 'html only',
      }, 'documents ready');
    } catch (err) {
      log.warn({ job: job.title.slice(0, 40), why: err instanceof Error ? err.message.slice(0, 140) : String(err) }, 'could not tailor this one');
    }
  }
}

await closeDb();
