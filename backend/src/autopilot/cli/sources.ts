import { pool, closeDb } from '../shared/db.js';

/** The receipt: what every source did the last time it ran. */
const r = await pool.query<{ label: string; kind: string; found: number; added: number; last_result: string; age: string }>(
  `SELECT label, kind, found, added, last_result,
          COALESCE(to_char(now() - last_run_at, 'DD"d" HH24"h" MI"m"'), 'never') AS age
     FROM autopilot_sources ORDER BY (last_result = 'ok') DESC, found DESC`,
);
const pad = (s: string | number, n: number) => String(s).slice(0, n).padEnd(n);
console.log(pad('SOURCE', 26), pad('KIND', 6), pad('SEEN', 6), pad('KEPT', 6), pad('RESULT', 34), 'LAST RUN');
for (const s of r.rows) {
  console.log(pad(s.label, 26), pad(s.kind, 6), pad(s.found, 6), pad(s.added, 6), pad(s.last_result === 'ok' ? 'worked' : s.last_result, 34), s.age, 'ago');
}
const ok = r.rows.filter((s) => s.last_result === 'ok').length;
console.log(`\n${ok} of ${r.rows.length} sources worked on their last run.`);
await closeDb();
