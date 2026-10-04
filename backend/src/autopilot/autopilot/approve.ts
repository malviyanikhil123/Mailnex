import { randomBytes } from 'node:crypto';
import { pool } from '../shared/db.js';
import { slugify } from './normalize.js';

/**
 * Asking permission, and remembering the answer.
 *
 * A decision link works without signing in — it arrives by email and has to be usable
 * from a phone in a queue. What makes that safe is that the link is one long random
 * token, good for one job, one person and forty-eight hours, and it stops working the
 * moment it is used. Doing nothing is a decision too: the job quietly expires.
 */

const LIVES_FOR_HOURS = 48;

export type Decision = 'approved' | 'rejected' | 'never';

export type Waiting = {
  token: string;
  jobId: number;
  title: string;
  companyName: string;
  location: string | null;
  url: string;
  score: number | null;
  confidence: string | null;
  summary: string | null;
  parts: Array<{ part: string; got: number; of: number; why: string }> | null;
  knockouts: string[] | null;
  changes: string[] | null;
  gaps: string[] | null;
  coverLetter: string | null;
  expiresAt: string;
};

/** Opens a question for one job. Asking twice about the same job just returns the first ask. */
export async function ask(userId: number, jobId: number): Promise<string> {
  const token = randomBytes(24).toString('hex');
  const row = await pool.query<{ token: string }>(
    `INSERT INTO autopilot_approvals (user_id, job_id, token, expires_at)
     VALUES ($1, $2, $3, now() + interval '${LIVES_FOR_HOURS} hours')
     ON CONFLICT (user_id, job_id) DO UPDATE SET token = autopilot_approvals.token
     RETURNING token`,
    [userId, jobId, token],
  );
  return row.rows[0]!.token;
}

/** Everything this person still has to decide, best first. */
export async function waitingFor(userId: number): Promise<Waiting[]> {
  const rows = await pool.query<Waiting>(
    `SELECT a.token, j.id AS "jobId", j.title, j.company_name AS "companyName", j.location, j.url,
            s.score, s.confidence, s.summary, s.parts, s.knockouts,
            t.changes, t.gaps, t.cover_letter AS "coverLetter",
            a.expires_at AS "expiresAt"
       FROM autopilot_approvals a
       JOIN autopilot_jobs j ON j.id = a.job_id
       LEFT JOIN autopilot_scores s ON s.job_id = j.id AND s.user_id = a.user_id
       LEFT JOIN autopilot_tailored t ON t.job_id = j.id AND t.user_id = a.user_id
      WHERE a.user_id = $1 AND a.state = 'waiting' AND a.expires_at > now()
      ORDER BY s.score DESC NULLS LAST`,
    [userId],
  );
  return rows.rows;
}

/** What one decision link points at. Null when it is wrong, used, or too old. */
export async function byToken(token: string): Promise<(Waiting & { userId: number; resumeHtml: string | null; answers: Record<string, string> | null }) | null> {
  const rows = await pool.query<Waiting & { userId: number; resumeHtml: string | null; answers: Record<string, string> | null }>(
    `SELECT a.user_id AS "userId", a.token, j.id AS "jobId", j.title, j.company_name AS "companyName",
            j.location, j.url, s.score, s.confidence, s.summary, s.parts, s.knockouts,
            t.changes, t.gaps, t.cover_letter AS "coverLetter", t.resume_html AS "resumeHtml", t.answers,
            a.expires_at AS "expiresAt"
       FROM autopilot_approvals a
       JOIN autopilot_jobs j ON j.id = a.job_id
       LEFT JOIN autopilot_scores s ON s.job_id = j.id AND s.user_id = a.user_id
       LEFT JOIN autopilot_tailored t ON t.job_id = j.id AND t.user_id = a.user_id
      WHERE a.token = $1 AND a.state = 'waiting' AND a.expires_at > now()`,
    [token],
  );
  return rows.rows[0] ?? null;
}

/** Records the answer. The same link cannot be used twice, so a forwarded email is harmless. */
export async function decide(token: string, decision: Decision, note?: string): Promise<{ ok: boolean; companyName?: string }> {
  const found = await pool.query<{ user_id: number; job_id: number; company_name: string }>(
    `UPDATE autopilot_approvals a
        SET state = $2, note = $3, decided_at = now()
       FROM autopilot_jobs j
      WHERE a.token = $1 AND a.job_id = j.id AND a.state = 'waiting' AND a.expires_at > now()
      RETURNING a.user_id, a.job_id, j.company_name`,
    [token, decision, note ?? null],
  );
  const row = found.rows[0];
  if (!row) return { ok: false };

  if (decision === 'never') {
    await pool.query(
      `INSERT INTO autopilot_blocked_companies (user_id, company_slug, company_name)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [row.user_id, slugify(row.company_name), row.company_name],
    );
    // Nothing else from that company should sit waiting either.
    await pool.query(
      `UPDATE autopilot_approvals a SET state = 'never', decided_at = now()
         FROM autopilot_jobs j
        WHERE a.job_id = j.id AND a.user_id = $1 AND a.state = 'waiting' AND j.company_name = $2`,
      [row.user_id, row.company_name],
    );
  }

  return { ok: true, companyName: row.company_name };
}

/** Questions nobody answered in time. Silence means no, and is recorded as such. */
export async function expireOld(): Promise<number> {
  const out = await pool.query(
    `UPDATE autopilot_approvals SET state = 'expired', decided_at = now()
      WHERE state = 'waiting' AND expires_at <= now()`,
  );
  return out.rowCount ?? 0;
}
