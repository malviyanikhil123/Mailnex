import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { env } from '../shared/env.js';
import { alert } from '../shared/alert.js';
import { settingsOf } from '../autopilot/settings.js';
import { whereForPerson } from '../autopilot/match.js';
import { ask, expireOld } from '../autopilot/approve.js';

/**
 * The email that asks you to decide.
 *
 * It is deliberately plain: mail clients strip scripts, web fonts and blur, so anything
 * clever would arrive broken. The email carries the shortlist and a link each; the link
 * opens the real approval screen, where the score, the reasoning and the rewritten resume
 * are laid out properly.
 *
 *   pnpm run digest        everyone with a profile
 *   pnpm run digest 1      one person
 */

const who = Number(process.argv[2] ?? 0);
const howMany = Number(process.env.DIGEST_LIMIT ?? 6);
const WHERE = process.env.APP_URL ?? `http://localhost:${process.env.FRONT_PORT ?? 5056}`;

const gone = await expireOld();
if (gone) log.info({ expired: gone }, 'questions nobody answered in time');

const people = await pool.query<{ user_id: number; full_name: string; email: string | null }>(
  who
    ? 'SELECT user_id, full_name, email FROM autopilot_profiles WHERE user_id = $1'
    : 'SELECT user_id, full_name, email FROM autopilot_profiles WHERE user_id IS NOT NULL',
  who ? [who] : [],
);

for (const person of people.rows) {
  const settings = await settingsOf(person.user_id);
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  args.push(person.user_id);
  const me = `$${args.length}`;

  // Worth asking about: judged, not ruled out, documents written, and not asked before.
  const jobs = await pool.query<{ id: number; title: string; company_name: string; location: string | null; score: number; summary: string; confidence: string }>(
    `SELECT j.id, j.title, j.company_name, j.location, s.score, s.summary, s.confidence
       FROM autopilot_jobs j
       JOIN autopilot_scores s ON s.job_id = j.id AND s.user_id = ${me}
       JOIN autopilot_tailored t ON t.job_id = j.id AND t.user_id = ${me}
      WHERE ${mine.length ? mine.join(' AND ') : 'true'}
        AND s.verdict <> 'knocked out'
        AND NOT EXISTS (SELECT 1 FROM autopilot_approvals a WHERE a.job_id = j.id AND a.user_id = ${me})
      ORDER BY s.score DESC
      LIMIT ${Math.min(Math.max(howMany, 1), 20)}`,
    args,
  );

  if (!jobs.rows.length) {
    log.info({ person: person.full_name }, 'nothing new to ask about');
    continue;
  }

  const rows: string[] = [];
  const plain: string[] = [];

  for (const job of jobs.rows) {
    const token = await ask(person.user_id, job.id);
    const link = `${WHERE}/approve.html?t=${token}`;
    const colour = job.score >= 75 ? '#1a7f4b' : job.score >= 55 ? '#8a6100' : '#8a2c40';

    rows.push(`
      <tr><td style="padding:14px 0;border-bottom:1px solid #e3e6ec">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="54" valign="top">
            <div style="width:44px;height:44px;border-radius:10px;background:#f1f3f7;color:${colour};
              font:700 17px Georgia,serif;text-align:center;line-height:44px">${job.score}</div>
          </td>
          <td valign="top">
            <div style="font:600 15px Helvetica,Arial,sans-serif;color:#141820">${esc(job.title)}</div>
            <div style="font:14px Helvetica,Arial,sans-serif;color:#5d6b7f;padding:2px 0 6px">
              ${esc(job.company_name)}${job.location ? ' · ' + esc(job.location) : ''}
              ${job.confidence === 'low' ? ' · <span style="color:#8a6100">thin advert</span>' : ''}
            </div>
            <div style="font:13.5px Helvetica,Arial,sans-serif;color:#39404c;padding-bottom:9px">${esc(job.summary ?? '')}</div>
            <a href="${link}" style="display:inline-block;background:#141820;color:#fff;text-decoration:none;
              font:500 13.5px Helvetica,Arial,sans-serif;padding:9px 16px;border-radius:8px">Look at it &rarr;</a>
          </td>
        </tr></table>
      </td></tr>`);

    plain.push(`${job.score}/100  ${job.title} at ${job.company_name}\n${link}\n`);
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px 12px">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;
      border:1px solid #e3e6ec;border-radius:14px;padding:26px 28px">
      <tr><td>
        <div style="font:700 19px Georgia,serif;color:#141820">Job Autopilot</div>
        <div style="font:14px Helvetica,Arial,sans-serif;color:#5d6b7f;padding:4px 0 18px">
          ${jobs.rows.length} job${jobs.rows.length === 1 ? '' : 's'} worth your decision, ${esc(person.full_name.split(' ')[0] ?? '')}.
          Each one already has a resume and cover letter written for it.
        </div>
        <table width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
        <div style="font:12.5px Helvetica,Arial,sans-serif;color:#8a90a0;padding-top:18px">
          Each link works once and expires in 48 hours. Nothing is sent unless you approve it —
          and applying is not switched on yet, so approving only marks it ready.
        </div>
      </td></tr>
    </table></body></html>`;

  const to = person.email ?? env.ALERT_EMAIL ?? env.GMAIL_EMAIL;
  await alert(`Job Autopilot: ${jobs.rows.length} to decide on`, plain.join('\n'), { to, html });
  log.info({ person: person.full_name, asked: jobs.rows.length, to }, 'digest sent');
}

await closeDb();

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
