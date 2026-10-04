import { z } from 'zod';
import { pool } from '../shared/db.js';
import { askFor } from '../shared/llm.js';

/**
 * Turning a resume into a master profile, in one place so the command line
 * and the web app cannot drift apart.
 *
 * The split is deliberate: the AI only copies facts off the page, and every
 * judgement — how many years is too many, which degrees are a dead end — is
 * worked out here in code, so the answer is the same whichever model is awake.
 */

export const Facts = z.object({
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  currentTitle: z.string().describe('the job title in the most recent role'),
  jobTitlesHeld: z.array(z.string()).describe('every job title in the resume, newest first'),
  monthsOfPaidWork: z.number().describe('months of paid work up to today; count a role marked Present as still running'),
  highestDegree: z.string().nullable().describe('the exact course name, or null'),
  degreeLevel: z.enum(['none', 'diploma', 'bachelor', 'master', 'doctorate']),
  gradYear: z.number().nullable(),
  skills: z.array(z.string()).describe('skills and tools, as written'),
  salaryStated: z.number().nullable().describe('a pay figure ONLY if the resume prints one; otherwise null'),
});

export type Facts = z.infer<typeof Facts>;

/** What goes in the profile row once the rules have been applied. */
export type Profile = {
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  targetRoles: string[];
  seniority: string;
  years: string;
  degree: string | null;
  degreeLevel: string;
  gradYear: number | null;
  skills: string[];
  salaryFloor: number | null;
  salaryCurrency: string | null;
  salaryNote: string;
  knockouts: Record<string, unknown>;
  neverContact: string[];
  resumeText: string;
};

/** Reads the plain facts off a resume. Nothing is invented and nothing is judged here. */
export async function readResume(resumeText: string): Promise<Facts> {
  return askFor(
    Facts,
    `Today is ${new Date().toISOString().slice(0, 10)}. Copy the facts below out of this resume.
Report only what is written. If something is not on the page, use null or an empty list.

RESUME
------
${resumeText}`,
    'You copy facts out of resumes. You never invent anything that is not written on the page.',
  );
}

const LADDER = ['none', 'diploma', 'bachelor', 'master', 'doctorate'];

/** Degrees the person does not hold. A job that insists on one of these is not for them. */
function degreesOutOfReach(degreeLevel: string): string[] {
  const above = LADDER.slice(LADDER.indexOf(degreeLevel) + 1);
  return above.flatMap((d) =>
    d === 'master' ? ['master', 'mba', 'm.tech', 'ms degree'] : d === 'doctorate' ? ['doctorate', 'phd'] : [d]);
}

/**
 * Applies the rules to the facts. `extraRoles` are the searches the person already
 * runs, `neverContact` the employers they must not be shown — both come from outside
 * the resume, so they are passed in rather than guessed.
 */
export function workOutProfile(
  f: Facts,
  resumeText: string,
  extras: { extraRoles?: string[]; neverContact?: string[]; salaryFloor?: number | null; salaryCurrency?: string | null } = {},
): Profile {
  const years = Math.round((f.monthsOfPaidWork / 12) * 10) / 10;
  const seniority = years < 3 ? 'junior' : years < 7 ? 'mid' : 'senior';

  // Their titles plus the searches they already run — one list, no repeats.
  const targetRoles = [...new Set([f.currentTitle, ...f.jobTitlesHeld, ...(extras.extraRoles ?? [])]
    .map((r) => String(r).trim()).filter(Boolean))];

  const knockouts = {
    maxYearsAsked: Math.max(4, Math.ceil(years) + 2),   // asks for more paid years than this → skip
    degreeLevelsThatFail: degreesOutOfReach(f.degreeLevel),
    needsSecurityClearance: true,                       // skip: nobody here has one
    needsWorkPermitYouLack: ['us citizen', 'green card', 'security clearance', 'eu passport required'],
    mustNotRequire: [] as string[],                     // nothing extra; add rules here when you want them
  };

  // A floor the person set themselves beats anything printed on the resume.
  const salaryFloor = extras.salaryFloor ?? f.salaryStated ?? null;
  const salaryNote = extras.salaryFloor != null
    ? 'you set this floor yourself'
    : f.salaryStated != null
      ? 'taken from the resume'
      : 'your resume does not print any pay figure, so nothing is dropped over salary — say a floor whenever you want one';

  return {
    fullName: f.fullName,
    email: f.email,
    phone: f.phone,
    city: f.city,
    country: f.country,
    targetRoles,
    seniority,
    years: years.toFixed(1),
    degree: f.highestDegree,
    degreeLevel: f.degreeLevel,
    gradYear: f.gradYear,
    skills: f.skills,
    salaryFloor,
    salaryCurrency: extras.salaryCurrency ?? (salaryFloor != null ? 'INR' : null),
    salaryNote,
    knockouts,
    neverContact: extras.neverContact ?? [],
    resumeText,
  };
}

/** The columns a profile fills, in the order the values below are passed. */
const COLUMNS = [
  'full_name', 'email', 'phone', 'city', 'country', 'target_roles', 'seniority', 'years_experience',
  'degree', 'degree_level', 'grad_year', 'skills', 'salary_floor', 'salary_currency', 'salary_note',
  'knockouts', 'never_contact', 'resume_text',
];

const valuesOf = (p: Profile): unknown[] => [
  p.fullName, p.email, p.phone, p.city, p.country, JSON.stringify(p.targetRoles), p.seniority, p.years,
  p.degree, p.degreeLevel, p.gradYear, JSON.stringify(p.skills), p.salaryFloor, p.salaryCurrency, p.salaryNote,
  JSON.stringify(p.knockouts), JSON.stringify(p.neverContact), p.resumeText,
];

/**
 * Saves one person's profile. A row is found by user_id, so nobody can land on
 * anybody else's. The command line still writes the older row that has no user_id
 * on it, which is why the slug is used as a fallback key there.
 */
export async function saveProfile(who: { userId: number | null; slug: string }, p: Profile): Promise<void> {
  const values = valuesOf(p);
  const placeholders = COLUMNS.map((_, i) => `$${i + 3}`).join(', ');
  const insert = `INSERT INTO autopilot_profiles (slug, user_id, ${COLUMNS.join(', ')}, updated_at)
     VALUES ($1, $2, ${placeholders}, now())
     ON CONFLICT (user_id) DO UPDATE SET
       ${COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`;

  if (who.userId != null) {
    await pool.query(insert, [who.slug, who.userId, ...values]);
    return;
  }

  // No user_id: Postgres treats every NULL as different, so the upsert above would
  // add a second row each run. Update the one we already have, or start it.
  const sets = COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const touched = await pool.query(
    `UPDATE autopilot_profiles SET ${sets}, updated_at = now() WHERE slug = $1 AND user_id IS NULL`,
    [who.slug, ...values],
  );
  if (!touched.rowCount) await pool.query(insert, [who.slug, null, ...values]);
}

/**
 * Two screens showed two different pay floors before this existed. The resume
 * decides who somebody is; their settings decide what they will take. Whenever
 * the settings change, the profile is brought into step — and only their own row.
 */
export async function applySettings(
  userId: number,
  s: { targetRoles: string[]; salaryFloor: number | null; salaryCurrency: string | null; neverContact: string[] },
): Promise<void> {
  await pool.query(
    `UPDATE autopilot_profiles
        SET target_roles = $2, salary_floor = $3, salary_currency = $4, never_contact = $5,
            salary_note = CASE WHEN $3::integer IS NULL
              THEN 'no floor set, so nothing is dropped over pay'
              ELSE 'you set this floor yourself' END,
            updated_at = now()
      WHERE user_id = $1`,
    [userId, JSON.stringify(s.targetRoles), s.salaryFloor, s.salaryCurrency, JSON.stringify(s.neverContact)],
  );
}

/** One person's profile as the web app shows it. Never called without a user id. */
export async function profileOf(userId: number): Promise<Record<string, unknown> | null> {
  const found = await pool.query(
    `SELECT full_name, city, country, target_roles, seniority, years_experience, degree,
            salary_floor, salary_currency, salary_note, knockouts, never_contact, skills, updated_at
       FROM autopilot_profiles WHERE user_id = $1`,
    [userId],
  );
  return found.rows[0] ?? null;
}
