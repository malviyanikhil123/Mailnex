import { pool } from '../shared/db.js';
import { settingsOf } from './settings.js';
import { whereForPerson } from './match.js';

/**
 * Which sign-ups are standing between you and the jobs you want.
 *
 * Some application systems will not take anything until you have an account with them —
 * Workday wants one per employer, Naukri and LinkedIn want one each. Rather than
 * discovering that one job at a time, this counts how many of your jobs each missing
 * account is blocking, so you can decide where it is worth ten minutes of your time.
 *
 * Nothing here creates an account. Two reasons, and both are firm: on LinkedIn, Naukri
 * and Indeed automated sign-up breaks their terms and puts the account at risk, and
 * everywhere else it needs your real details and a confirmation email. The system asks,
 * counts and remembers; the signing up is yours.
 */

export type Platform = {
  key: string;
  label: string;
  match: RegExp;
  scope: 'platform' | 'employer';
  signup: string | null;
  canWeCreate: boolean;
  note: string;
};

export const PLATFORMS: Platform[] = [
  {
    key: 'workday', label: 'Workday', match: /workday|myworkdayjobs/i, scope: 'employer', signup: null,
    canWeCreate: false,
    note: 'Workday gives every employer their own separate sign-up. One account does not carry over to the next company.',
  },
  {
    key: 'oracle', label: 'Oracle / Taleo', match: /oraclecloud|taleo/i, scope: 'employer', signup: null,
    canWeCreate: false,
    note: 'Also one account per employer, on an older system that is awkward to fill in.',
  },
  {
    key: 'icims', label: 'iCIMS', match: /icims/i, scope: 'employer', signup: null,
    canWeCreate: false,
    note: 'Account plus a puzzle to prove you are human, so it cannot be done unattended.',
  },
  {
    key: 'successfactors', label: 'SAP SuccessFactors', match: /successfactors|sapsf/i, scope: 'employer', signup: null,
    canWeCreate: false,
    note: 'Account required per employer.',
  },
  {
    key: 'smartrecruiters', label: 'SmartRecruiters', match: /smartrecruiters/i, scope: 'employer', signup: null,
    canWeCreate: false,
    note: 'Some employers allow applying as a guest; others insist on an account.',
  },
  {
    key: 'naukri', label: 'Naukri', match: /naukri\.com/i, scope: 'platform',
    signup: 'https://www.naukri.com/registration/createAccount',
    canWeCreate: false,
    note: 'The main board for Indian roles. An account also lets recruiters find you, which is half its value. Signing up by robot is against their terms.',
  },
  {
    key: 'linkedin', label: 'LinkedIn', match: /linkedin\.com/i, scope: 'platform',
    signup: 'https://www.linkedin.com/signup',
    canWeCreate: false,
    note: 'You already have one. Applying still has to be done in your own browser, never by a robot.',
  },
  {
    key: 'indeed', label: 'Indeed', match: /indeed\.com/i, scope: 'platform',
    signup: 'https://secure.indeed.com/account/register',
    canWeCreate: false,
    note: 'Needed for "Apply with Indeed". Automated sign-up is blocked and against their terms.',
  },
  {
    key: 'wellfound', label: 'Wellfound', match: /wellfound\.com|angel\.co/i, scope: 'platform',
    signup: 'https://wellfound.com/signup',
    canWeCreate: false,
    note: 'Startup roles. One account covers every employer on it.',
  },
  {
    key: 'instahyre', label: 'Instahyre', match: /instahyre\.com/i, scope: 'platform',
    signup: 'https://www.instahyre.com/candidate-signup/',
    canWeCreate: false,
    note: 'Indian startup roles, invitation-style applications.',
  },
];

export type Needed = {
  id: number;
  platform: string;
  label: string;
  scope: string;
  employer: string | null;
  signup_url: string | null;
  jobs_blocked: number;
  state: string;
  can_we_create: boolean;
  note: string | null;
};

/**
 * Looks over the jobs this person would actually want and works out what is in the way.
 * Run again whenever you like — the counts are refreshed, decisions already made are kept.
 */
export async function findWhatIsBlocking(userId: number): Promise<number> {
  const settings = await settingsOf(userId);
  const args: unknown[] = [];
  const mine = whereForPerson(settings, args);
  const clause = mine.length ? `WHERE ${mine.join(' AND ')}` : '';

  const jobs = await pool.query<{ url: string; company_name: string }>(
    `SELECT url, company_name FROM autopilot_jobs ${clause}`, args,
  );

  // Count per platform, and per employer where the sign-up is per employer.
  const tally = new Map<string, { platform: Platform; employer: string | null; n: number }>();
  for (const job of jobs.rows) {
    const platform = PLATFORMS.find((p) => p.match.test(job.url));
    if (!platform) continue;
    const employer = platform.scope === 'employer' ? job.company_name : null;
    const key = `${platform.key}|${employer ?? ''}`;
    const row = tally.get(key) ?? { platform, employer, n: 0 };
    row.n++;
    tally.set(key, row);
  }

  for (const { platform, employer, n } of tally.values()) {
    await pool.query(
      `INSERT INTO autopilot_accounts_needed
         (user_id, platform, label, scope, employer, signup_url, jobs_blocked, can_we_create, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, platform, COALESCE(employer, '')) DO UPDATE
         SET jobs_blocked = EXCLUDED.jobs_blocked, seen_at = now()`,
      [userId, platform.key, employer ? `${platform.label} — ${employer}` : platform.label,
       platform.scope, employer, platform.signup, n, platform.canWeCreate, platform.note],
    );
  }

  return tally.size;
}

/** What is waiting on you, the ones blocking most jobs first. */
export async function needed(userId: number, state?: string): Promise<Needed[]> {
  const rows = await pool.query<Needed>(
    `SELECT id, platform, label, scope, employer, signup_url, jobs_blocked, state, can_we_create, note
       FROM autopilot_accounts_needed
      WHERE user_id = $1 ${state ? 'AND state = $2' : ''}
      ORDER BY (state = 'asking') DESC, jobs_blocked DESC`,
    state ? [userId, state] : [userId],
  );
  return rows.rows;
}

/** Your answer about one of them. */
export async function answer(userId: number, id: number, state: 'approved' | 'created' | 'skipped'): Promise<boolean> {
  const out = await pool.query(
    `UPDATE autopilot_accounts_needed SET state = $3, decided_at = now()
      WHERE id = $2 AND user_id = $1`,
    [userId, id, state],
  );
  return (out.rowCount ?? 0) > 0;
}
