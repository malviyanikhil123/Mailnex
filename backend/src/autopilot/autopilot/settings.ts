import { z } from 'zod';
import { pool } from '../shared/db.js';
import { env, roles as defaultRoles, countries as defaultCountries } from '../shared/env.js';
import { lock, unlock } from '../shared/secret.js';

/**
 * What each person is looking for. Jobs are found once and shared by everyone,
 * so these settings only decide what a person is shown — never what is fetched.
 * Someone who has never been through onboarding gets the .env defaults.
 */

export type Settings = {
  targetRoles: string[];
  countries: string[];
  maxAgeDays: number;
  salaryFloor: number | null;
  salaryCurrency: string | null;
  currentEmployer: string | null;
  gmailEmail: string | null;          // their own mailbox, for their own job alerts
  hasMailbox: boolean;                // the password itself is never handed back out
};

/** What a person may send us. Anything missing keeps its old value. */
export const SettingsInput = z.object({
  targetRoles: z.array(z.string().trim().min(1)).max(40).optional(),
  countries: z.array(z.string().trim().min(1)).max(40).optional(),
  maxAgeDays: z.coerce.number().int().min(1).max(365).optional(),
  salaryFloor: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryCurrency: z.string().trim().max(8).nullable().optional(),
  currentEmployer: z.string().trim().max(200).nullable().optional(),
  gmailEmail: z.string().trim().email().nullable().optional(),
  gmailAppPassword: z.string().trim().max(64).nullable().optional(),
});

/**
 * What someone gets before they have chosen anything.
 *
 * Only the owner inherits what is in .env — those are their roles, their countries and
 * their employer. Anybody else starts empty, because showing a new person somebody
 * else's job filter is worse than showing them nothing.
 */
export const defaults = (owner = false): Settings => ({
  targetRoles: owner ? [...defaultRoles] : [],
  countries: owner ? [...defaultCountries] : [],
  maxAgeDays: env.JOB_MAX_AGE_DAYS,
  salaryFloor: null,
  salaryCurrency: null,
  currentEmployer: owner ? env.CURRENT_EMPLOYER ?? null : null,
  gmailEmail: owner ? env.GMAIL_EMAIL ?? null : null,
  hasMailbox: owner ? Boolean(env.GMAIL_APP_PASSWORD) : false,
});

type Row = {
  target_roles: string[] | null;
  countries: string[] | null;
  max_age_days: number | null;
  salary_floor: number | null;
  salary_currency: string | null;
  current_employer: string | null;
};

/** The settings in force for one person: their own where they have them, defaults otherwise. */
export async function settingsOf(userId: number): Promise<Settings> {
  const found = await pool.query<Row & { gmail_email: string | null; gmail_password_enc: string | null }>(
    `SELECT s.target_roles, s.countries, s.max_age_days, s.salary_floor, s.salary_currency,
            s.current_employer, s.gmail_email, s.gmail_password_enc,
            (p.user_id IS NOT NULL AND p.slug = 'me') AS is_owner
       FROM autopilot_user_settings s
       LEFT JOIN autopilot_profiles p ON p.user_id = s.user_id
      WHERE s.user_id = $1`,
    [userId],
  );
  const row = found.rows[0];

  // Only the first account — the one whose profile predates accounts — inherits .env.
  const owner = Boolean((row as unknown as { is_owner?: boolean })?.is_owner) || (await isOwner(userId));
  const base = defaults(owner);
  if (!row) return base;

  return {
    targetRoles: row.target_roles?.length ? row.target_roles : base.targetRoles,
    countries: row.countries?.length ? row.countries : base.countries,
    maxAgeDays: row.max_age_days ?? base.maxAgeDays,
    salaryFloor: row.salary_floor,
    salaryCurrency: row.salary_currency,
    currentEmployer: row.current_employer,
    gmailEmail: row.gmail_email ?? base.gmailEmail,
    hasMailbox: Boolean(row.gmail_password_enc) || base.hasMailbox,
  };
}

/** The owner is whoever holds the profile that was made before accounts existed. */
async function isOwner(userId: number): Promise<boolean> {
  const r = await pool.query<{ yes: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM autopilot_profiles WHERE user_id = $1 AND slug = 'me') AS yes`, [userId]);
  return r.rows[0]?.yes ?? false;
}

/** One person's mailbox, for reading their own job alerts. Null when they have not set one up. */
export async function mailboxOf(userId: number): Promise<{ email: string; password: string } | null> {
  const r = await pool.query<{ gmail_email: string | null; gmail_password_enc: string | null }>(
    'SELECT gmail_email, gmail_password_enc FROM autopilot_user_settings WHERE user_id = $1', [userId]);
  const row = r.rows[0];
  const password = unlock(row?.gmail_password_enc ?? null);
  if (row?.gmail_email && password) return { email: row.gmail_email, password };

  // The owner's mailbox still comes from .env, so nothing of theirs has to be re-entered.
  if (await isOwner(userId) && env.GMAIL_EMAIL && env.GMAIL_APP_PASSWORD) {
    return { email: env.GMAIL_EMAIL, password: env.GMAIL_APP_PASSWORD };
  }
  return null;
}

/** Everyone who has a mailbox we can read. */
export async function everyMailbox(): Promise<Array<{ userId: number; email: string; password: string }>> {
  const r = await pool.query<{ user_id: number }>(
    'SELECT user_id FROM autopilot_profiles WHERE user_id IS NOT NULL');
  const out: Array<{ userId: number; email: string; password: string }> = [];
  for (const { user_id } of r.rows) {
    const box = await mailboxOf(user_id);
    if (box) out.push({ userId: user_id, ...box });
  }
  return out;
}

/** Writes one person's settings. The user id is never taken from the request body. */
export async function saveSettings(userId: number, patch: z.infer<typeof SettingsInput>): Promise<Settings> {
  const now = await settingsOf(userId);
  const next: Settings = {
    targetRoles: patch.targetRoles ?? now.targetRoles,
    countries: patch.countries?.map((c) => c.toLowerCase()) ?? now.countries,
    maxAgeDays: patch.maxAgeDays ?? now.maxAgeDays,
    salaryFloor: patch.salaryFloor === undefined ? now.salaryFloor : patch.salaryFloor,
    salaryCurrency: patch.salaryCurrency === undefined ? now.salaryCurrency : (patch.salaryCurrency || null),
    currentEmployer: patch.currentEmployer === undefined ? now.currentEmployer : (patch.currentEmployer || null),
    gmailEmail: patch.gmailEmail === undefined ? now.gmailEmail : (patch.gmailEmail || null),
    hasMailbox: patch.gmailAppPassword ? true : now.hasMailbox,
  };

  // The password is sealed before it goes anywhere near the database, and an empty
  // value means "leave what is already there" rather than "wipe it".
  const sealed = patch.gmailAppPassword
    ? lock(patch.gmailAppPassword.replace(/\s+/g, ''))
    : null;
  await pool.query(
    `INSERT INTO autopilot_user_settings
       (user_id, target_roles, countries, max_age_days, salary_floor, salary_currency, current_employer, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id) DO UPDATE SET
       target_roles = EXCLUDED.target_roles, countries = EXCLUDED.countries,
       max_age_days = EXCLUDED.max_age_days, salary_floor = EXCLUDED.salary_floor,
       salary_currency = EXCLUDED.salary_currency, current_employer = EXCLUDED.current_employer,
       updated_at = now()`,
    [userId, JSON.stringify(next.targetRoles), JSON.stringify(next.countries), next.maxAgeDays,
     next.salaryFloor, next.salaryCurrency, next.currentEmployer],
  );

  if (patch.gmailEmail !== undefined || sealed) {
    await pool.query(
      `UPDATE autopilot_user_settings
          SET gmail_email = COALESCE($2, gmail_email),
              gmail_password_enc = COALESCE($3, gmail_password_enc)
        WHERE user_id = $1`,
      [userId, next.gmailEmail, sealed],
    );
  }

  return next;
}

/** Employers to hide, as a list — the field is typed as one line with commas. */
export const employersToAvoid = (s: Settings): string[] =>
  (s.currentEmployer ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * The roles this person has actually chosen, or none.
 *
 * `settingsOf` falls back to the roles in .env so the owner's command-line tools keep
 * working. That fallback must never reach a new account: it would fold the owner's
 * "business analyst" into a software engineer's searches, which is exactly what the
 * flow test caught.
 */
export async function ownRoles(userId: number): Promise<string[]> {
  const found = await pool.query<{ target_roles: string[] | null }>(
    'SELECT target_roles FROM autopilot_user_settings WHERE user_id = $1',
    [userId],
  );
  return found.rows[0]?.target_roles ?? [];
}
