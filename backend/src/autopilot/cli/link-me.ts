import { pool, closeDb } from '../shared/db.js';
import { log } from '../shared/log.js';
import { saveSettings } from '../autopilot/settings.js';

/**
 * The owner's profile was built before accounts existed, so it belongs to nobody.
 * This hands it to their account, and starts their search settings from what the
 * resume said — the same thing onboarding would do, without retyping it.
 */
const me = await pool.query<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower($1)", [process.argv[2] ?? '']);
const id = me.rows[0]?.id;
if (!id) {
  log.warn({ email: process.argv[2] }, 'no account with that email');
} else {
  const done = await pool.query<{ id: number; target_roles: string[] | null; country: string | null; full_name: string }>(
    `UPDATE autopilot_profiles SET user_id = $1
      WHERE user_id IS NULL AND id = (SELECT min(id) FROM autopilot_profiles WHERE user_id IS NULL)
      RETURNING id, target_roles, country, full_name`,
    [id],
  );
  const row = done.rows[0];
  if (!row) {
    log.info({ userId: id }, 'nothing loose to attach — you may already have a profile');
  } else {
    await saveSettings(id, { targetRoles: row.target_roles ?? [], maxAgeDays: 7 });
    log.info({ userId: id, profile: row.full_name, roles: (row.target_roles ?? []).slice(0, 4) }, 'your profile is now attached to your account');
  }
}
await closeDb();
