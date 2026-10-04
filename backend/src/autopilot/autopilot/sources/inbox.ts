import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../../shared/env.js';
import { log } from '../../shared/log.js';
import type { RawJob } from '../normalize.js';

/**
 * Reads your own inbox for job alert emails and pulls the job links out.
 * Zero bot risk: we never touch LinkedIn or Naukri here, only your mail.
 */

type Board = { key: string; from: RegExp; link: RegExp; applyKind: string };

const BOARDS: Board[] = [
  { key: 'linkedin-alert', from: /linkedin\.com$/i, link: /https:\/\/[^"'\s]*linkedin\.com\/comm\/jobs\/view\/(\d+)[^"'\s]*/gi, applyKind: 'linkedin' },
  { key: 'naukri-alert', from: /naukri\.com$/i, link: /https:\/\/[^"'\s]*naukri\.com\/job-listings-[^"'\s]+/gi, applyKind: 'naukri' },
  { key: 'wellfound-alert', from: /(wellfound|angel)\.co$/i, link: /https:\/\/[^"'\s]*wellfound\.com\/jobs\/[^"'\s]+/gi, applyKind: 'company site' },
  { key: 'instahyre-alert', from: /instahyre\.com$/i, link: /https:\/\/[^"'\s]*instahyre\.com\/[^"'\s]*opportunit[^"'\s]+/gi, applyKind: 'company site' },
  { key: 'indeed-alert', from: /indeed\.com$/i, link: /https:\/\/[^"'\s]*indeed\.com\/(viewjob|rc\/clk)[^"'\s]+/gi, applyKind: 'company site' },
];

const clean = (u: string) => {
  const tidy = u.replace(/&amp;/g, '&').replace(/[)>\].,'"]+$/, '');
  // Alert emails link the same job three times over — logo, title, apply — each with its
  // own tracking tail. Cutting the tail off makes them one job again.
  const linkedin = tidy.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
  if (linkedin) return `https://www.linkedin.com/jobs/view/${linkedin[1]}/`;
  return tidy.split('?')[0] ?? tidy;
};

/** "Backend Engineer at Razorpay" → title + company, when the subject or link text says so. */
/**
 * Reads one job out of a LinkedIn alert email.
 *
 * The email is laid out as a block per job, and every part of that block carries the
 * job's own id in its tracking link. So rather than guessing from the words near a link,
 * we take the block belonging to this job and read it: the company name sits in the
 * logo's alt text, the title is the wording of the job link itself, and the place
 * follows just after it.
 */
function fromBlock(html: string, jobId: string): { title: string; company: string; location: string | null } | null {
  if (!html || !jobId) return null;

  // Every mention of a job id, in order, so one job's block can be cut out exactly:
  // from where this job is first named, to where a different job is first named.
  const marks = [...html.matchAll(/jobid_(\d+)/g)];
  const first = marks.find((m) => m[1] === jobId);
  if (!first) return null;

  const start = first.index!;
  const next = marks.find((m) => m.index! > start && m[1] !== jobId);
  const from = Math.max(0, html.lastIndexOf('<td', start));
  const block = html.slice(from, next ? next.index! : Math.min(html.length, start + 4000));

  // Stripped of its markup, a block reads in a fixed order:
  //   "Business Intelligence Analyst"
  //   "DigitalTek Solutions · India (Remote)"
  //   "Easy Apply"
  const lines = block
    .split(/<[^>]+>/)
    .map((x) => x
      .replace(/&amp;/g, '&')
      .replace(/&middot;/g, '·')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((x) => x.length > 1 && !x.startsWith('<') && !/^(easy apply|apply|actively reviewing|promoted|view job)$/i.test(x));

  const title = lines[0] && lines[0].length < 120 ? lines[0] : '';

  // The line carrying the middle dot holds the company and the place.
  const both = lines.find((x) => x.includes('·')) ?? '';
  const [namePart, ...placeParts] = both.split('·');
  const company = (namePart ?? '').trim() || html.slice(from, start).match(/alt="([^"]{2,80})"/)?.[1]?.trim() || '';
  const place = placeParts.join('·').trim();

  if (!title && !company) return null;
  return {
    title,
    company: company && !/linkedin/i.test(company) ? company : '',
    location: place && place.length < 80 ? place : null,
  };
}

/** "Backend Engineer at Razorpay" -> title + company, when the subject or link text says so. */
function splitTitle(text: string): { title: string; company: string } {
  const m = text.match(/^(.+?)\s+(?:at|@|-)\s+(.+)$/);
  if (m) return { title: m[1]!.trim(), company: m[2]!.trim() };
  return { title: text.trim(), company: 'Unknown (from alert)' };
}

/**
 * Reads one mailbox. Each person has their own: their alerts arrive in their inbox,
 * not somebody else's, so the mailbox has to be handed in rather than read from .env.
 * The jobs themselves still go to the one shared pool — an advert is an advert.
 */
export async function readAlerts(days = 7, mailbox?: { email: string; password: string }): Promise<RawJob[]> {
  const email = mailbox?.email ?? env.GMAIL_EMAIL;
  const password = mailbox?.password ?? env.GMAIL_APP_PASSWORD;
  if (!email || !password) return [];

  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  const jobs: RawJob[] = [];
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const uids = await client.search({ since });
    log.info({ mailbox: email, messagesSince: uids ? uids.length : 0, days }, 'inbox opened');

    for await (const msg of client.fetch({ since }, { source: true, envelope: true })) {
      const from = msg.envelope?.from?.[0]?.address ?? '';
      const domain = from.split('@')[1] ?? '';
      const board = BOARDS.find((b) => b.from.test(domain));
      if (!board) continue;

      const mail = await simpleParser(msg.source!);
      const body = `${mail.html || ''}\n${mail.text || ''}`;
      const subject = mail.subject ?? '';
      const seen = new Set<string>();

      for (const match of body.matchAll(board.link)) {
        const url = clean(match[0]!);
        if (seen.has(url)) continue;
        seen.add(url);

        const read = match[1] ? fromBlock(String(mail.html ?? ''), match[1]) : null;

        // Guessing from the words near the link is the last resort, and it shows:
        // it used to leave most rows as "Unknown (from alert)".
        let title = read?.title ?? '';
        let company = read?.company ?? '';
        if (!title || !company) {
          const idx = body.indexOf(match[0]!);
          const around = body.slice(Math.max(0, idx - 400), idx + 400).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          const guess = around.match(/([A-Z][A-Za-z0-9/+&.,' -]{6,60}(?:Engineer|Developer|Manager|Architect|Analyst|Scientist|Lead|Consultant))/);
          const fallback = splitTitle(guess?.[1] ?? subject.replace(/^.*?:\s*/, ''));
          title = title || fallback.title;
          company = company || fallback.company;
        }

        jobs.push({
          title: title.slice(0, 120) || 'Job from alert email',
          companyName: company.slice(0, 80),
          location: read?.location ?? null,
          description: null,
          url,
          applyKind: board.applyKind,
          postedAt: mail.date ?? null,
          sourceKey: board.key,
          sourceJobId: match[1] ?? null,
          raw: { subject, from },
        });
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return jobs;
}
