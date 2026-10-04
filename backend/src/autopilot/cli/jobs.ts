import { sql } from 'drizzle-orm';
import { db, closeDb } from '../shared/db.js';

/** A plain look at what the hunt found. Usage: pnpm jobs [search words] */
const term = process.argv.slice(2).join(' ').trim();

const totals = await db.execute<{ jobs: string; companies: string; countries: string; last: string }>(sql`
  SELECT (SELECT count(*) FROM autopilot_jobs)::text AS jobs,
         (SELECT count(DISTINCT company_name) FROM autopilot_jobs)::text AS companies,
         (SELECT count(DISTINCT country) FROM autopilot_jobs)::text AS countries,
         (SELECT to_char(max(first_seen_at), 'DD Mon HH24:MI') FROM autopilot_jobs) AS last
`);
const t = totals.rows[0]!;
console.log(`\n${t.jobs} jobs · ${t.companies} companies · ${t.countries} countries · last found ${t.last}\n`);

const bySource = await db.execute<{ label: string; found: string; added: string; result: string }>(sql`
  SELECT label, found::text, added::text, coalesce(last_result,'-') AS result
    FROM autopilot_sources ORDER BY added DESC, found DESC LIMIT 8
`);
console.log('Top sources');
for (const r of bySource.rows) console.log(`  ${r.label.padEnd(24)} found ${r.found.padStart(4)}  new ${r.added.padStart(4)}  ${r.result}`);

const byCountry = await db.execute<{ country: string; n: string }>(sql`
  SELECT coalesce(country,'?') AS country, count(*)::text AS n
    FROM autopilot_jobs GROUP BY 1 ORDER BY count(*) DESC LIMIT 8
`);
console.log('\nWhere they are');
for (const r of byCountry.rows) console.log(`  ${r.country.padEnd(10)} ${r.n}`);

const where = term ? sql`WHERE title ILIKE ${'%' + term + '%'} OR company_name ILIKE ${'%' + term + '%'}` : sql``;
const rows = await db.execute<{ title: string; company_name: string; location: string; source_key: string; seen: string }>(sql`
  SELECT title, company_name, coalesce(location,'-') AS location, source_key,
         to_char(first_seen_at,'DD Mon HH24:MI') AS seen
    FROM autopilot_jobs ${where} ORDER BY first_seen_at DESC LIMIT 15
`);
console.log(`\n${term ? `Latest matching "${term}"` : 'Latest found'}`);
for (const r of rows.rows) {
  console.log(`  ${r.title.slice(0, 42).padEnd(44)} ${r.company_name.slice(0, 16).padEnd(18)} ${r.location.slice(0, 24).padEnd(26)} ${r.source_key}`);
}
console.log();
await closeDb();
