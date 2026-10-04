import { pool } from '../shared/db.js';
import { env } from '../shared/env.js';

/**
 * How the automatic searching is timed.
 *
 * There is no timetable and no clever rules: one search runs, and an hour after it
 * finishes the next one starts. A search takes as long as it takes, so counting from
 * the finish rather than the clock means two can never pile up on top of each other.
 */

export const gapMinutes = env.SCHEDULE_GAP_MINUTES;

export type RunRow = {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  found: number;
  added: number;
  note: string | null;
};

/** The last few runs, newest first — the owner's proof it is still working. */
export async function recentRuns(limit = 20): Promise<RunRow[]> {
  const rows = await pool.query<RunRow>(
    `SELECT id, kind, started_at, finished_at, ok, found, added, note
       FROM autopilot_runs ORDER BY started_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows.rows;
}

/**
 * When the next search is due: an hour after the last one finished.
 * Worked out from the database rather than from the scheduler, because the web app is a
 * separate process — if the scheduler is not running at all, this quietly reads as overdue,
 * which is exactly what the owner needs to see.
 */
export async function nextDue(): Promise<{ last: string | null; next: string | null; overdue: boolean; running: boolean }> {
  const last = await pool.query<{ finished_at: string | null; started_at: string }>(
    `SELECT started_at, finished_at FROM autopilot_runs WHERE kind = 'hunt' ORDER BY started_at DESC LIMIT 1`,
  );
  const row = last.rows[0];
  if (!row) return { last: null, next: null, overdue: false, running: false };
  if (!row.finished_at) return { last: row.started_at, next: null, overdue: false, running: true };

  const next = new Date(new Date(row.finished_at).getTime() + gapMinutes * 60_000);
  return {
    last: row.finished_at,
    next: next.toISOString(),
    overdue: next.getTime() < Date.now(),
    running: false,
  };
}

/** Opens a row the moment a run starts, so a run that dies half way is still visible. */
export async function beginRun(kind: string): Promise<number> {
  const r = await pool.query<{ id: number }>(
    'INSERT INTO autopilot_runs (kind, started_at) VALUES ($1, now()) RETURNING id',
    [kind],
  );
  return r.rows[0]!.id;
}

export async function endRun(id: number, ok: boolean, found = 0, added = 0, note: string | null = null): Promise<void> {
  await pool.query(
    'UPDATE autopilot_runs SET finished_at = now(), ok = $2, found = $3, added = $4, note = $5 WHERE id = $1',
    [id, ok, found, added, note?.slice(0, 300) ?? null],
  );
}
