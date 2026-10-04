import { z } from 'zod';
import { askFor } from '../shared/llm.js';
import { pool } from '../shared/db.js';
import type { Settings } from './settings.js';

/**
 * The Fit Score: 0–100, made of parts you can see, plus knockouts that reject a job
 * outright however good the number looks.
 *
 * Two rules hold this together. The score is always measured against the ORIGINAL resume,
 * never a tailored one, or the system would be marking its own homework. And the AI is only
 * ever asked to read the advert — every weight, every sum and every knockout is arithmetic
 * done here, so the same job and the same person always come out the same.
 */

export const WEIGHTS = {
  mustHave: 30,      // of the skills the advert calls required, how many you actually have
  niceToHave: 10,
  experience: 15,
  title: 15,
  domain: 10,
  location: 10,
  keywords: 10,      // the words the employer's screening software looks for
} as const;

/** What the AI reads off the advert. Facts only — no judgement, no scoring. */
const Reading = z.object({
  mustHaveSkills: z.array(z.string()).describe('skills the advert says are required, as written'),
  niceToHaveSkills: z.array(z.string()).describe('skills described as desirable, a bonus, or a plus'),
  yearsWanted: z.number().nullable().describe('the least years of experience asked for, or null'),
  yearsWantedUpper: z.number().nullable().describe('the top of the range if one is given, else null'),
  degreeDemanded: z.string().nullable().describe("a degree the advert insists on, eg 'master', 'mba', 'phd'; null if any degree or none is fine"),
  needsClearanceOrCitizenship: z.boolean().describe('true only if it demands a security clearance, a passport or a right to work the reader may not have'),
  salaryFloorMentioned: z.number().nullable().describe('the lowest pay figure printed in the advert, as a plain number, else null'),
  salaryCurrency: z.string().nullable(),
  salaryPeriod: z.enum(['year', 'month', 'hour', 'unknown']).describe('what that pay figure is per'),
  domain: z.string().describe('the industry in one or two words, eg fintech, healthcare, e-commerce'),
  workMode: z.enum(['remote', 'hybrid', 'onsite', 'unclear']),
  city: z.string().nullable(),
  seniority: z.enum(['junior', 'mid', 'senior', 'lead', 'unclear']),
  keyWords: z.array(z.string()).describe('up to 15 words or phrases a screening system would look for'),
  clear: z.boolean().describe('false when the advert is vague, very short, or mostly about the company'),
});

export type Reading = z.infer<typeof Reading>;

export type Person = {
  fullName: string;
  skills: string[];
  years: number;
  seniority: string;
  degreeLevel: string;
  city: string | null;
  country: string | null;
  resumeText: string;
  domains: string[];
};

export type Part = { part: string; got: number; of: number; why: string };

export type Score = {
  score: number;
  parts: Part[];
  knockouts: string[];
  confidence: 'high' | 'medium' | 'low';
  verdict: 'knocked out' | 'apply' | 'ask me' | 'skip';
  summary: string;
};

/* ---------------- the small helpers, so the sums stay honest ---------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Does this person have that skill? Written loosely on purpose: "React.js" is "react". */
function hasSkill(person: Person, skill: string): boolean {
  const want = norm(skill);
  if (!want) return false;
  const short = want.replace(/\b(experience|knowledge|skills?|with|in|of|strong|good)\b/g, '').trim();
  const hay = norm(`${person.skills.join(' ')} ${person.resumeText}`);
  return hay.includes(want) || (short.length > 2 && hay.includes(short));
}

function countHits(person: Person, list: string[]): { hit: string[]; missed: string[] } {
  const hit: string[] = [];
  const missed: string[] = [];
  for (const s of list) (hasSkill(person, s) ? hit : missed).push(s);
  return { hit, missed };
}

/** Full marks inside the range they asked for, and a soft slope outside it. */
function experienceMark(person: Person, read: Reading): { got: number; why: string } {
  const of = WEIGHTS.experience;
  if (read.yearsWanted == null) return { got: of * 0.7, why: 'no experience level stated, so given the benefit of the doubt' };

  const low = read.yearsWanted;
  const high = read.yearsWantedUpper ?? low + 3;
  const you = person.years;

  if (you >= low && you <= high) return { got: of, why: `they want ${low}–${high} years, you have ${you.toFixed(1)}` };
  if (you > high) {
    // Being over-qualified is a smaller problem than being under.
    const over = you - high;
    return { got: Math.max(of * 0.6, of - over * 2), why: `they want up to ${high} years, you have ${you.toFixed(1)}` };
  }
  const short = low - you;
  if (short <= 1) return { got: of * 0.75, why: `they want ${low} years, you have ${you.toFixed(1)} — close` };
  if (short <= 2) return { got: of * 0.45, why: `they want ${low} years, you have ${you.toFixed(1)}` };
  return { got: 0, why: `they want ${low} years, you have ${you.toFixed(1)} — well short` };
}

function titleMark(title: string, roles: string[]): { got: number; why: string } {
  const of = WEIGHTS.title;
  const t = norm(title);
  const exact = roles.find((r) => t.includes(norm(r)));
  if (exact) return { got: of, why: `the title is your job: "${exact}"` };

  // A cousin: some of the words line up, but not the whole title.
  const words = new Set(roles.flatMap((r) => norm(r).split(' ')).filter((w) => w.length > 3));
  const shared = [...words].filter((w) => t.includes(w));
  if (shared.length >= 2) return { got: of * 0.7, why: `close to your job (${shared.join(', ')})` };
  if (shared.length === 1) return { got: of * 0.35, why: `only loosely your job (${shared[0]})` };
  return { got: 0, why: 'not your job' };
}

function locationMark(person: Person, read: Reading, settings: Settings, country: string): { got: number; why: string } {
  const of = WEIGHTS.location;
  if (read.workMode === 'remote') return { got: of, why: 'remote' };
  if (person.city && read.city && norm(read.city).includes(norm(person.city))) return { got: of, why: `in your city, ${read.city}` };
  if (settings.countries.includes(country)) {
    return read.workMode === 'hybrid'
      ? { got: of * 0.6, why: `hybrid in a country you chose (${country})` }
      : { got: of * 0.5, why: `on site in a country you chose (${country})` };
  }
  return { got: of * 0.2, why: 'you would have to move' };
}

function keywordMark(person: Person, read: Reading): { got: number; why: string } {
  const of = WEIGHTS.keywords;
  if (!read.keyWords.length) return { got: of * 0.5, why: 'nothing much for a screening system to match' };
  const { hit } = countHits(person, read.keyWords);
  const share = hit.length / read.keyWords.length;
  return { got: Math.round(of * share), why: `your resume carries ${hit.length} of their ${read.keyWords.length} key words` };
}

/* ---------------- the knockouts ---------------- */

function knockouts(person: Person, read: Reading, settings: Settings, job: { companyName: string; postedAt: Date | null }): string[] {
  const out: string[] = [];
  const LADDER = ['none', 'diploma', 'bachelor', 'master', 'doctorate'];
  const mine = LADDER.indexOf(person.degreeLevel);

  if (read.degreeDemanded) {
    const want = norm(read.degreeDemanded);
    const level = want.includes('phd') || want.includes('doctor') ? 4
      : want.includes('master') || want.includes('mba') || want.includes('m.tech') ? 3
      : want.includes('bachelor') || want.includes('degree') ? 2 : -1;
    if (level > mine && level > 0) out.push(`asks for a ${read.degreeDemanded}, which you do not have`);
  }

  if (read.needsClearanceOrCitizenship) out.push('asks for a clearance or a right to work you do not have');

  if (read.yearsWanted != null && read.yearsWanted > person.years + 2) {
    out.push(`asks for ${read.yearsWanted} years, you have ${person.years.toFixed(1)}`);
  }

  if (settings.salaryFloor && read.salaryFloorMentioned && read.salaryPeriod === 'year') {
    if (read.salaryFloorMentioned < settings.salaryFloor) {
      out.push(`pays ${read.salaryFloorMentioned}, below your floor of ${settings.salaryFloor}`);
    }
  }

  for (const avoid of (settings.currentEmployer ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (norm(job.companyName).includes(norm(avoid))) out.push(`${job.companyName} is on your never-contact list`);
  }

  if (job.postedAt) {
    const days = (Date.now() - job.postedAt.getTime()) / 86_400_000;
    if (days > settings.maxAgeDays) out.push(`posted ${Math.round(days)} days ago, past your ${settings.maxAgeDays}-day limit`);
  }

  return out;
}

/* ---------------- putting it together ---------------- */

export async function readAdvert(job: { title: string; companyName: string; description: string | null; location: string | null; salaryText: string | null }): Promise<Reading> {
  return askFor(
    Reading,
    `Read this job advert and copy out what it says. Do not judge it and do not guess.
If something is not stated, use null, false or an empty list.

TITLE: ${job.title}
COMPANY: ${job.companyName}
LOCATION: ${job.location ?? 'not stated'}
PAY: ${job.salaryText ?? 'not stated'}

ADVERT
------
${(job.description ?? '').slice(0, 6000)}`,
    'You read job adverts and report only what is written in them.',
  );
}

export function scoreAgainst(
  person: Person,
  read: Reading,
  settings: Settings,
  job: { title: string; companyName: string; country: string; postedAt: Date | null },
): Score {
  const out = knockouts(person, read, settings, job);

  const must = countHits(person, read.mustHaveSkills);
  const nice = countHits(person, read.niceToHaveSkills);
  const exp = experienceMark(person, read);
  const title = titleMark(job.title, settings.targetRoles);
  const loc = locationMark(person, read, settings, job.country);
  const key = keywordMark(person, read);

  const domainHit = person.domains.some((d) => norm(read.domain).includes(norm(d)) || norm(d).includes(norm(read.domain)));

  const parts: Part[] = [
    {
      part: 'Must-have skills', of: WEIGHTS.mustHave,
      got: read.mustHaveSkills.length ? Math.round(WEIGHTS.mustHave * (must.hit.length / read.mustHaveSkills.length)) : Math.round(WEIGHTS.mustHave * 0.6),
      why: read.mustHaveSkills.length
        ? `you have ${must.hit.length} of ${read.mustHaveSkills.length}${must.missed.length ? ' — missing ' + must.missed.slice(0, 3).join(', ') : ''}`
        : 'the advert names no required skills',
    },
    {
      part: 'Nice-to-have skills', of: WEIGHTS.niceToHave,
      got: read.niceToHaveSkills.length ? Math.round(WEIGHTS.niceToHave * (nice.hit.length / read.niceToHaveSkills.length)) : Math.round(WEIGHTS.niceToHave * 0.5),
      why: read.niceToHaveSkills.length ? `you have ${nice.hit.length} of ${read.niceToHaveSkills.length}` : 'none listed',
    },
    { part: 'Experience fit', of: WEIGHTS.experience, got: Math.round(exp.got), why: exp.why },
    { part: 'Title match', of: WEIGHTS.title, got: Math.round(title.got), why: title.why },
    {
      part: 'Domain', of: WEIGHTS.domain,
      got: domainHit ? WEIGHTS.domain : Math.round(WEIGHTS.domain * 0.4),
      why: domainHit ? `${read.domain}, which you have worked in` : `${read.domain}, new to you`,
    },
    { part: 'Location and work mode', of: WEIGHTS.location, got: Math.round(loc.got), why: loc.why },
    { part: 'Screening key words', of: WEIGHTS.keywords, got: Math.round(key.got), why: key.why },
  ];

  const score = out.length ? 0 : Math.min(100, parts.reduce((sum, p) => sum + p.got, 0));

  // A thin advert makes every part above a guess, so the number is offered with less certainty.
  const thin = !read.clear || (read.mustHaveSkills.length === 0 && read.keyWords.length < 4);
  const confidence: Score['confidence'] = out.length ? 'high' : thin ? 'low' : read.yearsWanted == null ? 'medium' : 'high';

  const verdict: Score['verdict'] = out.length ? 'knocked out'
    : confidence === 'low' ? 'ask me'          // never act on a guess, however high it scores
    : score >= 75 ? 'apply'
    : score >= 55 ? 'ask me'
    : 'skip';

  const summary = out.length
    ? `Knocked out: ${out[0]}`
    : `${score}/100 — ${parts.filter((p) => p.got >= p.of * 0.7).length} of 7 parts strong. ${parts[0]!.why}, ${exp.why}.`;

  return { score, parts, knockouts: out, confidence, verdict, summary };
}

/** Keeps one score per person per job, with the reasons, so nothing is ever a black box. */
export async function saveScore(userId: number, jobId: number, s: Score, read: Reading): Promise<void> {
  await pool.query(
    `INSERT INTO autopilot_scores (user_id, job_id, score, verdict, confidence, summary, parts, knockouts, reading, scored_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (user_id, job_id) DO UPDATE SET
       score = EXCLUDED.score, verdict = EXCLUDED.verdict, confidence = EXCLUDED.confidence,
       summary = EXCLUDED.summary, parts = EXCLUDED.parts, knockouts = EXCLUDED.knockouts,
       reading = EXCLUDED.reading, scored_at = now()`,
    [userId, jobId, s.score, s.verdict, s.confidence, s.summary,
     JSON.stringify(s.parts), JSON.stringify(s.knockouts), JSON.stringify(read)],
  );
}
