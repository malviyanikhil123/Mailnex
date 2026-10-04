import { z } from 'zod';
import { pool } from '../shared/db.js';
import { askFor } from '../shared/llm.js';

/**
 * Breaking a resume into pieces.
 *
 * A tailored resume is not written; it is assembled. So the resume is first cut into
 * jobs, projects, skills and education, with every line kept in the resume's own words.
 * Later, tailoring only ever chooses among these pieces and rewords them — it can never
 * reach for something that is not here, because there is nowhere else to reach.
 */

const Parts = z.object({
  jobs: z.array(z.object({
    title: z.string(),
    employer: z.string(),
    place: z.string().nullable(),
    started: z.string().nullable().describe('as written, eg "06/2024"'),
    ended: z.string().nullable().describe('as written, or "Present"'),
    bullets: z.array(z.string()).describe('each line under this role, copied word for word'),
    tags: z.array(z.string()).describe('tools, methods and skills this role shows'),
  })),
  projects: z.array(z.object({
    name: z.string(),
    context: z.string().nullable().describe('where it was built, or the client'),
    bullets: z.array(z.string()).describe('copied word for word'),
    tags: z.array(z.string()),
  })),
  skills: z.array(z.string()).describe('every skill and tool named anywhere, as written'),
  education: z.array(z.object({
    qualification: z.string(),
    institution: z.string(),
    ended: z.string().nullable(),
  })),
  courses: z.array(z.string()),
});

export type Parts = z.infer<typeof Parts>;

export async function breakUp(resume: string): Promise<Parts> {
  return askFor(
    Parts,
    `Cut this resume into its pieces. Copy every bullet point exactly as written — do not
improve, shorten or merge them. Do not add anything that is not on the page.

RESUME
------
${resume}`,
    'You take resumes apart into structured pieces. You copy words exactly and never invent.',
  );
}

export async function saveParts(userId: number, parts: Parts): Promise<number> {
  await pool.query('DELETE FROM autopilot_resume_parts WHERE user_id = $1', [userId]);

  const rows: Array<[string, string, string | null, string | null, string | null, string | null, string[], string[], number]> = [];
  let rank = 0;

  for (const j of parts.jobs) {
    rows.push(['job', j.title, j.employer, j.place, j.started, j.ended, j.bullets, j.tags, rank++]);
  }
  for (const p of parts.projects) {
    rows.push(['project', p.name, p.context, null, null, null, p.bullets, p.tags, rank++]);
  }
  for (const s of parts.skills) {
    rows.push(['skill', s, null, null, null, null, [], [s], rank++]);
  }
  for (const e of parts.education) {
    rows.push(['education', e.qualification, e.institution, null, null, e.ended, [], [], rank++]);
  }
  for (const c of parts.courses) {
    rows.push(['course', c, null, null, null, null, [], [], rank++]);
  }

  for (const [kind, heading, org, place, started, ended, bullets, tags, order] of rows) {
    await pool.query(
      `INSERT INTO autopilot_resume_parts (user_id, kind, heading, org, place, started, ended, bullets, tags, rank)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [userId, kind, heading, org, place, started, ended, JSON.stringify(bullets), JSON.stringify(tags), order],
    );
  }
  return rows.length;
}

export type Part = {
  id: number;
  kind: string;
  heading: string;
  org: string | null;
  place: string | null;
  started: string | null;
  ended: string | null;
  bullets: string[];
  tags: string[];
  rank: number;
};

export async function partsOf(userId: number): Promise<Part[]> {
  const rows = await pool.query<Part>(
    `SELECT id, kind, heading, org, place, started, ended,
            COALESCE(bullets, '[]'::jsonb) AS bullets, COALESCE(tags, '[]'::jsonb) AS tags, rank
       FROM autopilot_resume_parts WHERE user_id = $1 ORDER BY rank`,
    [userId],
  );
  return rows.rows;
}
