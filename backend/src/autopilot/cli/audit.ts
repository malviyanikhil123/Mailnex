import { pool, closeDb } from '../shared/db.js';
const q = async (label: string, sql: string) => {
  const r = await pool.query(sql);
  console.log('\n' + label);
  for (const row of r.rows) console.log('  ' + Object.values(row).map((v) => String(v ?? '—').slice(0, 44)).join(' · '));
};
await q('TOTALS', `SELECT count(*)::int AS pool, count(*) FILTER (WHERE role_match)::int AS your_roles FROM autopilot_jobs`);
await q('YOUR ROLES BY COUNTRY', `SELECT country, count(*)::int FROM autopilot_jobs WHERE role_match GROUP BY 1 ORDER BY 2 DESC LIMIT 12`);
await q('NEWEST 12 OF YOURS', `SELECT title, company_name, country FROM autopilot_jobs WHERE role_match ORDER BY COALESCE(posted_at, first_seen_at) DESC LIMIT 12`);
await q('IN INDIA', `SELECT title, company_name FROM autopilot_jobs WHERE role_match AND country = 'in' ORDER BY COALESCE(posted_at, first_seen_at) DESC LIMIT 10`);
await closeDb();
