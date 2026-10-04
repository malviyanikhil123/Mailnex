import { z } from 'zod';
import { pool } from '../shared/db.js';
import { askFor } from '../shared/llm.js';
import { checkRewording, allowedFrom, withoutInvention } from './honesty.js';
import { partsOf, type Part } from './parts.js';

/**
 * Making one resume for one job.
 *
 * Nothing is written from nothing. The pieces of the real resume are chosen, put in a
 * useful order, and reworded in the advert's own vocabulary — and every rewording is
 * checked before it is kept. What the job wants and the person has not got is recorded
 * as a gap, to be shown honestly, never quietly filled in.
 */

export type JobForTailoring = {
  id: number;
  title: string;
  companyName: string;
  description: string | null;
  location: string | null;
};

export type Person = {
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
};

const Plan = z.object({
  keepJobs: z.array(z.number()).describe('ids of the work experience pieces to keep, best first'),
  keepProjects: z.array(z.number()).describe('ids of the projects worth showing for THIS job, best first'),
  keepSkills: z.array(z.string()).describe('the person\'s own skills that matter here, most relevant first'),
  reworded: z.array(z.object({
    partId: z.number(),
    index: z.number().describe('which bullet within that piece, counting from 0'),
    original: z.string(),
    rewritten: z.string().describe('the same fact in the advert\'s vocabulary. Never a new fact.'),
  })),
  gaps: z.array(z.string()).describe('what the advert asks for that this person genuinely does not have'),
  summary: z.string().describe('two or three sentences at the top of the resume, built only from what is below it'),
  coverLetter: z.string().describe('a short letter, 120-180 words, plain and specific, no flattery'),
  answers: z.object({
    whyThisCompany: z.string(),
    noticePeriod: z.string(),
    expectedSalary: z.string(),
  }),
});

export type Tailored = {
  summary: string;
  jobs: Part[];
  projects: Part[];
  skills: string[];
  tools: string[];          // the resume keeps these in their own group, so we do too
  aiTools: string[];
  education: Part[];
  courses: string[];
  bullets: Map<string, string>;         // "partId:index" -> the wording to print
  changes: string[];
  gaps: string[];
  coverLetter: string;
  answers: Record<string, string>;
};

export async function tailorFor(userId: number, job: JobForTailoring): Promise<Tailored> {
  const parts = await partsOf(userId);
  const jobs = parts.filter((p) => p.kind === 'job');
  const projects = parts.filter((p) => p.kind === 'project');
  const education = parts.filter((p) => p.kind === 'education');
  const courses = parts.filter((p) => p.kind === 'course').map((p) => p.heading);
  const everySkill = parts.filter((p) => p.kind === 'skill').map((p) => p.heading);

  // Your resume separates plain skills from software and from AI tooling. Keep that,
  // because a reader scanning for "Jira" expects to find it under tools, not prose.
  const AI = /(copilot|gpt|openai|gemini|claude|bedrock|cursor|antigravity|llm|langchain|whisper)/i;
  const TOOL = /(jira|figma|photoshop|excel|word|confluence|tableau|power ?bi|sql|postman|slack|notion|miro|trello|visio)/i;
  const aiTools = everySkill.filter((s) => AI.test(s));
  const tools = everySkill.filter((s) => !AI.test(s) && TOOL.test(s));
  const skills = everySkill.filter((s) => !AI.test(s) && !TOOL.test(s));

  const describe = (list: Part[]) => list.map((p) =>
    `#${p.id} ${p.heading}${p.org ? ` at ${p.org}` : ''}${p.started ? ` (${p.started} - ${p.ended ?? 'now'})` : ''}\n`
    + p.bullets.map((b, i) => `   [${i}] ${b}`).join('\n')).join('\n\n');

  const plan = await askFor(
    Plan,
    `Choose from this person's real resume what belongs on an application for the job below,
and reword only where the advert uses different words for the same thing.

Hard rule: you may re-order, shorten and rephrase. You may never introduce a tool,
technology, employer, date, number or achievement that is not already in the pieces below.
If the job needs something they do not have, put it in "gaps" — never in a bullet.

THE JOB
-------
${job.title} at ${job.companyName}${job.location ? `, ${job.location}` : ''}
${(job.description ?? '').slice(0, 5000)}

THEIR WORK EXPERIENCE
---------------------
${describe(jobs)}

THEIR PROJECTS
--------------
${describe(projects)}

THEIR SKILLS
------------
${skills.join(', ')}`,
    'You tailor resumes from a person\'s real history. You never invent. A gap is stated, not filled.',
  );

  // Every rewording is checked before it is allowed anywhere near the page.
  const allowed = [...skills, ...parts.flatMap((p) => p.tags), ...parts.map((p) => p.org ?? '')].filter(Boolean);
  const bullets = new Map<string, string>();
  const changes: string[] = [];
  let refused = 0;

  for (const r of plan.reworded) {
    const checked = checkRewording(r.original, r.rewritten, allowed);
    bullets.set(`${r.partId}:${r.index}`, checked.line);
    if (checked.kept) changes.push(`Reworded: "${r.original.slice(0, 60)}…" → "${r.rewritten.slice(0, 60)}…"`);
    else refused++;
  }
  if (refused) changes.push(`Kept ${refused} line${refused === 1 ? '' : 's'} as written — the rewording would have claimed something new.`);

  // The summary and the letter are written from nothing rather than reworded from a line,
  // so they get their own check against everything this person has actually said of
  // themselves. A sentence making a claim they cannot support is dropped, not softened.
  const canSay = allowedFrom([
    ...parts.flatMap((p) => p.bullets),
    ...parts.map((p) => `${p.heading} ${p.org ?? ''} ${p.tags.join(' ')}`),
  ]);

  const checkedSummary = withoutInvention(plan.summary, canSay);
  const checkedLetter = withoutInvention(plan.coverLetter, canSay);
  if (checkedSummary.dropped.length) {
    changes.push(`Cut a line from the summary — it claimed ${checkedSummary.dropped.slice(0, 3).join(', ')}, which is not on your resume.`);
  }
  if (checkedLetter.dropped.length) {
    changes.push(`Cut a line from the cover letter — it claimed ${checkedLetter.dropped.slice(0, 3).join(', ')}.`);
  }

  const keptJobs = plan.keepJobs.map((id) => jobs.find((j) => j.id === id)).filter(Boolean) as Part[];
  const keptProjects = plan.keepProjects.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as Part[];

  const droppedProjects = projects.length - keptProjects.length;
  if (droppedProjects > 0) changes.push(`Left out ${droppedProjects} project${droppedProjects === 1 ? '' : 's'} that do not help here.`);
  if (keptProjects[0]) changes.push(`Moved "${keptProjects[0].heading}" to the top.`);
  const shownSkills = plan.keepSkills.filter((s) => skills.some((own) => own.toLowerCase() === s.toLowerCase()));
  if (shownSkills.length) changes.push(`Put ${shownSkills.slice(0, 5).join(', ')} first in your skills.`);

  return {
    // If the check leaves nothing standing, say something plainly true rather than nothing.
    summary: checkedSummary.text
      || `${parts.find((p) => p.kind === 'job')?.heading ?? 'Analyst'} with experience in ${skills.slice(0, 4).join(', ')}.`,
    jobs: keptJobs.length ? keptJobs : jobs,     // never send a resume with no work history
    projects: keptProjects,
    skills: shownSkills.length ? shownSkills : skills,
    tools,
    aiTools,
    education,
    courses,
    bullets,
    changes,
    gaps: plan.gaps,
    // If the check leaves the letter empty, send no letter. Falling back to the original
    // would hand back exactly the sentences that had just been judged untrue.
    coverLetter: checkedLetter.text,
    answers: {
      'Why this company': plan.answers.whyThisCompany,
      'Notice period': plan.answers.noticePeriod,
      'Expected salary': plan.answers.expectedSalary,
    },
  };
}

/**
 * Your own resume's layout, rebuilt.
 *
 * Taken from Charul_Purohit_Resume-2.pdf: Times New Roman throughout, the employer as the
 * entry heading with the role, place and dates on the line beneath it, and the same type
 * hierarchy the original uses — 34.7 / 16.7 / 16 / 14.7 / 14 / 12.7 point. Sizes here are
 * scaled to fit A4 pages; the original is one continuous sheet, which prints badly.
 */
export function toHtml(person: Person, job: JobForTailoring, t: Tailored): string {
  const safe = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const line = (p: Part, i: number, b: string) => safe(t.bullets.get(`${p.id}:${i}`) ?? b);

  // Bold labels the original uses inside project text, kept bold here.
  const withLabels = (text: string) =>
    text.replace(/^(Business Problem|Solution|Key Business Impact|Tech Built|Impact):/i, '<strong>$1:</strong>');

  const role = (p: Part) => `
    <div class="entry">
      <div class="employer">${safe(p.org ?? p.heading)}</div>
      <div class="meta">${safe([p.heading, p.place].filter(Boolean).join(', '))}${
        p.started ? `<span class="when">${safe([p.started, p.ended].filter(Boolean).join(' - '))}</span>` : ''}</div>
      ${p.bullets.map((b, i) => `<p>${withLabels(line(p, i, b))}</p>`).join('')}
    </div>`;

  const project = (p: Part) => `
    <div class="entry">
      <div class="employer">${safe(p.heading)}</div>
      ${p.org ? `<div class="meta">${safe(p.org)}</div>` : ''}
      ${p.bullets.map((b, i) => `<p>${withLabels(line(p, i, b))}</p>`).join('')}
    </div>`;

  const study = (p: Part) => `
    <div class="entry">
      <div class="employer">${safe(p.heading)}</div>
      <div class="meta">${safe(p.org ?? '')}${p.ended ? `<span class="when">${safe(p.ended)}</span>` : ''}</div>
    </div>`;

  const contact = [person.phone, person.email, [person.city, person.country].filter(Boolean).join(', ')]
    .filter((x): x is string => Boolean(x)).map(safe).join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safe(person.fullName)} — ${safe(job.title)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.38; color: #000; margin: 0; }
  h1 { font-size: 27pt; font-weight: bold; margin: 0 0 3px; letter-spacing: -.2px; }
  .contact { font-size: 10.5pt; margin-bottom: 13px; }
  h2 { font-size: 13pt; font-weight: bold; margin: 15px 0 7px; padding-bottom: 2px; border-bottom: 1px solid #000; }
  h3 { font-size: 11.5pt; font-weight: bold; margin: 10px 0 3px; }
  .entry { margin-bottom: 10px; }
  .employer { font-size: 12.5pt; font-weight: bold; }
  .meta { font-size: 10pt; margin-bottom: 4px; }
  .meta .when { float: right; }
  .entry p { margin: 0 0 3px; padding-left: 12px; text-indent: -12px; }
  .entry p::before { content: ""; }
  .list { margin: 0; }
  .summary { margin: 0; text-align: justify; }
</style></head>
<body>
  <h1>${safe(person.fullName)}</h1>
  <div class="contact">${contact}</div>

  <h2>Summary</h2>
  <p class="summary">${safe(t.summary)}</p>

  <h2>Experience</h2>
  ${t.jobs.map(role).join('')}

  <h2>Skills</h2>
  <p class="list">${t.skills.map(safe).join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;')}</p>
  ${t.tools.length ? `<h3>Tools &amp; Software</h3><p class="list">${t.tools.map(safe).join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;')}</p>` : ''}
  ${t.aiTools.length ? `<h3>AI Tools &amp; LLM</h3><p class="list">${t.aiTools.map(safe).join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;')}</p>` : ''}

  ${t.projects.length ? `<h2>Projects</h2>${t.projects.map(project).join('')}` : ''}
  ${t.education.length ? `<h2>Education</h2>${t.education.map(study).join('')}` : ''}
  ${t.courses.length ? `<h2>Courses</h2>${t.courses.map((c) => `<p>${safe(c)}</p>`).join('')}` : ''}
</body></html>`;
}

export async function saveTailored(userId: number, jobId: number, html: string, pdfPath: string | null, t: Tailored): Promise<void> {
  await pool.query(
    `INSERT INTO autopilot_tailored (user_id, job_id, resume_html, resume_pdf_path, cover_letter, answers, changes, gaps, made_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (user_id, job_id) DO UPDATE SET
       resume_html = EXCLUDED.resume_html, resume_pdf_path = EXCLUDED.resume_pdf_path,
       cover_letter = EXCLUDED.cover_letter, answers = EXCLUDED.answers,
       changes = EXCLUDED.changes, gaps = EXCLUDED.gaps, made_at = now()`,
    [userId, jobId, html, pdfPath, t.coverLetter, JSON.stringify(t.answers), JSON.stringify(t.changes), JSON.stringify(t.gaps)],
  );
}
