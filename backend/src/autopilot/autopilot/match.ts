import type { Settings } from './settings.js';

/**
 * Deciding, in the database, whether a job is a given person's line of work.
 *
 * The `role_match` column was worked out once from the owner's roles, which was fine
 * while there was one user. With accounts, a software engineer would have been shown
 * the owner's business-analyst jobs. So the match is made per person at the moment
 * they ask, against their own saved roles.
 */

/** Titles nobody in this product wants: too junior, too senior, or a different job entirely. */
const NOT_FOR_YOU = '(intern|internship|trainee|principal|director|vice president|head of|chief|engineering manager)';

/** The short forms boards use that a person would never type into their settings. */
const SHORTHAND: Record<string, string[]> = {
  'business analyst': ['business analyst', 'business systems analyst', 'systems analyst', 'functional analyst', 'requirements analyst'],
  'software engineer': ['software engineer', 'software developer', 'backend engineer', 'back end engineer', 'frontend engineer', 'front end engineer', 'full stack', 'fullstack', 'sde'],
  'ai engineer': ['ai engineer', 'machine learning engineer', 'ml engineer', 'applied scientist', 'nlp engineer', 'deep learning', 'genai engineer', 'llm engineer'],
  'data analyst': ['data analyst', 'reporting analyst', 'analytics'],
  'product owner': ['product owner', 'product manager', 'product analyst'],
};

/** Grows a person's chosen roles into every spelling a job board might use. */
export function titlePatterns(roles: string[]): string[] {
  const out = new Set<string>();
  for (const role of roles) {
    const clean = role.toLowerCase().trim();
    if (!clean) continue;
    out.add(clean);
    for (const [key, spellings] of Object.entries(SHORTHAND)) {
      if (clean.includes(key) || key.includes(clean)) spellings.forEach((s) => out.add(s));
    }
  }
  return [...out].map((t) => `%${t}%`);
}

/**
 * Builds the WHERE clauses for one person. `args` is appended to in place, so the
 * numbering of the placeholders stays right whatever else the caller has already added.
 */
export function whereForPerson(
  settings: Settings,
  args: unknown[],
  opts: { everything?: boolean; ignoreAge?: boolean } = {},
): string[] {
  const where: string[] = [];

  if (!opts.everything) {
    const patterns = titlePatterns(settings.targetRoles);
    if (patterns.length) {
      args.push(patterns);
      where.push(`title ILIKE ANY($${args.length}::text[])`);
      where.push(`title !~* '${NOT_FOR_YOU}'`);
    } else {
      // Nobody has said what this person does yet. An empty list is the honest answer;
      // showing them the whole pool would be thousands of jobs meant for other people.
      where.push('false');
    }

    if (settings.countries.length) {
      args.push(settings.countries);
      where.push(`(country = ANY($${args.length}::text[]) OR (country = 'unknown'))`);
    }

    if (settings.currentEmployer) {
      // Never show someone a job at the company they are trying to leave.
      for (const name of settings.currentEmployer.split(',').map((s) => s.trim()).filter(Boolean)) {
        args.push(`%${name}%`);
        where.push(`company_name NOT ILIKE $${args.length}`);
      }
    }

    if (!opts.ignoreAge && settings.maxAgeDays > 0) {
      where.push(`COALESCE(posted_at, first_seen_at) > now() - interval '${Number(settings.maxAgeDays)} days'`);
    }
  }

  return where;
}
