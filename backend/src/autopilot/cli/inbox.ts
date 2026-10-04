import { log } from '../shared/log.js';
import { closeDb } from '../shared/db.js';
import { readAlerts } from '../autopilot/sources/inbox.js';
import { normalize } from '../autopilot/normalize.js';
import { storeJobs, recordRun } from '../autopilot/store.js';
import { everyMailbox } from '../autopilot/settings.js';

/**
 * Reads everybody's job alert emails.
 *
 * Each person connects their own mailbox, because their alerts arrive in their inbox.
 * The jobs all land in the one shared pool — an advert is the same advert whoever was
 * told about it — and whose roles it suits is decided later, per person.
 *
 *   pnpm run inbox        every mailbox we have
 *   pnpm run inbox 14     looking back a fortnight
 */
const days = Number(process.argv[2] ?? 7);

const boxes = await everyMailbox();
if (!boxes.length) {
  log.warn('nobody has connected a mailbox yet — add one under My profile');
}

const totals = { found: 0, added: 0, seenAgain: 0, duplicates: 0, mailboxes: 0, failed: 0 };

for (const box of boxes) {
  try {
    const raw = await readAlerts(days, box);
    const stored = await storeJobs(raw.map(normalize));

    const bySource = new Map<string, number>();
    for (const j of raw) bySource.set(j.sourceKey, (bySource.get(j.sourceKey) ?? 0) + 1);
    for (const [key, found] of bySource) await recordRun(key, key, 'alert-email', found, 0, 'ok');

    totals.found += raw.length;
    totals.added += stored.added;
    totals.seenAgain += stored.seenAgain;
    totals.duplicates += stored.duplicates;
    totals.mailboxes++;

    log.info({
      mailbox: box.email, linksFound: raw.length, new: stored.added,
      alreadyHad: stored.seenAgain, perSource: Object.fromEntries(bySource),
    }, 'mailbox read');

    if (!raw.length) {
      log.info({ mailbox: box.email }, 'no job alert emails here — set alerts up on LinkedIn and Naukri pointed at this address');
    }
  } catch (err) {
    totals.failed++;
    // One person's mailbox refusing must not stop everybody else's being read.
    log.warn({ mailbox: box.email, why: err instanceof Error ? err.message : String(err) }, 'could not read this mailbox');
  }
}

log.info(totals, 'inbox finished');
await closeDb();
