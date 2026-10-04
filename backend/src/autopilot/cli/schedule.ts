import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../shared/log.js';
import { alert } from '../shared/alert.js';
import { closeDb } from '../shared/db.js';
import { beginRun, endRun, gapMinutes } from '../autopilot/schedule.js';

/**
 * The automatic searching. Start it once and leave it alone:
 *
 *   read the alert emails → search every board → score what is new → wait an hour → again
 *
 * The hour is counted from the moment a search finishes, not from the clock, so a slow
 * search can never collide with the next one. Each pass is run as its own process: a
 * crash, a stuck browser or a source that hangs cannot take the scheduler down with it.
 */

const WAIT = gapMinutes * 60_000;
const STEPS = [
  { kind: 'inbox', label: 'alert emails', script: 'src/cli/inbox.ts', minutes: 10 },
  { kind: 'hunt', label: 'job search', script: 'src/cli/hunt.ts', minutes: 45 },
  // Scoring costs an AI call per advert, so it only ever looks at what the search just
  // brought in. Without this step a new job sits unread until somebody runs it by hand.
  { kind: 'judge', label: 'scoring new jobs', script: 'src/cli/judge.ts', minutes: 40 },
];

let stopping = false;
let failuresInARow = 0;

/** Runs one step to completion and reports what it did. */
function runStep(script: string, minutes: number): Promise<{ ok: boolean; found: number; added: number; note: string | null }> {
  return new Promise((resolve) => {
    const scriptBase = path.basename(script);
    const candidateFiles = [
      fileURLToPath(new URL(`./${scriptBase}`, import.meta.url)),
      fileURLToPath(new URL(`../../${script}`, import.meta.url)),
    ];
    const file = candidateFiles.find((f) => fs.existsSync(f)) ?? candidateFiles[0];
    const cwd = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
    const child = spawn(process.execPath, ['--import', 'tsx', file], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let found = 0;
    let added = 0;
    let note: string | null = null;

    // The scripts already log a tidy summary line; read it rather than counting again.
    const watch = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      for (const line of text.split('\n')) {
        if (!line.includes('finished')) continue;
        try {
          const row = JSON.parse(line);
          found = row.found ?? found;
          added = row.added ?? row.stored ?? added;
        } catch { /* a line that is not JSON is just a log line */ }
      }
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', (c: Buffer) => { note = c.toString().slice(-300); process.stderr.write(c); });

    const giveUp = setTimeout(() => {
      note = `gave up after ${minutes} minutes`;
      child.kill();
    }, minutes * 60_000);

    child.on('close', (code) => {
      clearTimeout(giveUp);
      resolve({ ok: code === 0, found, added, note: code === 0 ? null : note ?? `stopped with code ${code}` });
    });
  });
}

async function onePass(): Promise<void> {
  for (const step of STEPS) {
    if (stopping) return;
    const id = await beginRun(step.kind);
    log.info({ doing: step.label }, 'starting');

    const out = await runStep(step.script, step.minutes);
    await endRun(id, out.ok, out.found, out.added, out.note);

    if (out.ok) {
      log.info({ did: step.label, found: out.found, new: out.added }, 'done');
      failuresInARow = 0;
    } else {
      failuresInARow++;
      log.warn({ did: step.label, why: out.note, inARow: failuresInARow }, 'that pass failed');
      // One email, not one per failure: an alarm that cries every hour gets ignored.
      if (failuresInARow === 2) {
        await alert(
          'Job Autopilot: the automatic search is failing',
          `The ${step.label} has failed twice in a row.\n\nThe last thing it said:\n${out.note ?? 'nothing'}\n\n`
          + 'It will keep trying every hour. Nothing has stopped for good.',
        );
      }
    }
  }
}

/** Sleeps, but wakes at once if you stop the scheduler. */
function rest(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const cut = () => { clearTimeout(timer); resolve(); };
    process.once('SIGINT', cut);
    process.once('SIGTERM', cut);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true;
    log.info('stopping after this pass — press again to stop at once');
  });
}

log.info({ everyMinutes: gapMinutes }, 'automatic searching is on: a pass, then an hour, then the next');

while (!stopping) {
  const began = Date.now();
  try {
    await onePass();
  } catch (err) {
    log.error({ why: err instanceof Error ? err.message : String(err) }, 'the pass itself went wrong — carrying on');
  }
  if (stopping) break;
  const took = Math.round((Date.now() - began) / 1000);
  log.info({ tookSeconds: took, nextInMinutes: gapMinutes }, 'resting');
  await rest(WAIT);
}

log.info('automatic searching has stopped');
await closeDb();
