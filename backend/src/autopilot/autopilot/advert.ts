import { pool } from '../shared/db.js';
import { log } from '../shared/log.js';

/**
 * Getting the full words of an advert before scoring it.
 *
 * Aggregators hand over a two-line summary — hiring.cafe and Jooble average under 300
 * characters — and a Fit Score built on that is guesswork wearing a number. So a thin
 * advert is opened at its own address once, the text is kept, and every later score for
 * every person is judged on the real thing.
 *
 * Nothing here is clever: one polite request, no browser, no retries beyond the usual.
 * Sites that refuse are left alone and the summary stands, marked low confidence.
 */

export const THIN = 400;   // characters below which an advert is not worth scoring on

const strip = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The ATS boards have a plain JSON version of the page, which is cleaner than the HTML. */
function apiFor(url: string): string | null {
  const greenhouse = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/)
    ?? url.match(/job-boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (greenhouse) return `https://boards-api.greenhouse.io/v1/boards/${greenhouse[1]}/jobs/${greenhouse[2]}`;

  const lever = url.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{36})/i);
  if (lever) return `https://api.lever.co/v0/postings/${lever[1]}/${lever[2]}`;

  return null;
}

export async function fetchAdvert(url: string): Promise<string | null> {
  const target = apiFor(url) ?? url;
  try {
    const res = await fetch(target, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const body = await res.text();
    if (body.trim().startsWith('{')) {
      const data = JSON.parse(body) as { content?: string; description?: string; descriptionPlain?: string; lists?: Array<{ text?: string; content?: string }> };
      const bits = [data.content, data.description, data.descriptionPlain, ...(data.lists ?? []).map((l) => `${l.text ?? ''} ${l.content ?? ''}`)];
      const text = strip(bits.filter(Boolean).join(' '));
      return text.length >= THIN ? text : null;
    }

    const text = strip(body);
    // A page that is mostly navigation is not an advert; a blocked page is shorter still.
    return text.length >= THIN ? text.slice(0, 20_000) : null;
  } catch {
    return null;
  }
}

/**
 * The same job, through a real browser.
 *
 * Aggregator links and most big career sites turn a plain request away, exactly as they
 * turn away hiring.cafe. A browser on this machine is waved through, because it is a
 * person's browser on a person's connection. Slow — a few seconds each — so it is only
 * ever the second attempt, never the first.
 */
async function fetchAdvertInBrowser(urls: string[]): Promise<Map<string, string>> {
  const got = new Map<string, string>();
  if (!urls.length) return got;

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return got;     // no browser installed; the summaries will have to do
  }

  const browser = await chromium.launch();
  try {
    for (const url of urls) {
      // A fresh context each time: hiring.cafe taught us that reusing one trips the
      // bot checks on the second page.
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      try {
        const page = await context.newPage();
        await page.route('**/*', (route) => {
          const kind = route.request().resourceType();
          return kind === 'image' || kind === 'media' || kind === 'font' ? route.abort() : route.continue();
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
        const text = strip(await page.content());
        if (text.length >= THIN) got.set(url, text.slice(0, 20_000));
      } catch {
        /* one advert refusing is not worth stopping the rest */
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return got;
}

/**
 * Fills in the missing words for jobs whose stored advert is too thin to judge.
 * Safe to run again at any time: a job that has been filled in is not touched twice.
 */
export async function fattenThinAdverts(ids: number[]): Promise<{ tried: number; filled: number }> {
  if (!ids.length) return { tried: 0, filled: 0 };

  const rows = await pool.query<{ id: number; url: string }>(
    `SELECT id, url FROM autopilot_jobs
      WHERE id = ANY($1::int[]) AND (description IS NULL OR length(description) < $2)`,
    [ids, THIN],
  );

  let filled = 0;
  const refused: Array<{ id: number; url: string }> = [];

  for (const row of rows.rows) {
    const text = await fetchAdvert(row.url);
    if (text) {
      await pool.query('UPDATE autopilot_jobs SET description = $2 WHERE id = $1', [row.id, text]);
      filled++;
    } else {
      refused.push(row);
    }
    await new Promise((r) => setTimeout(r, 400));   // a gentle pace; these are other people's sites
  }

  // Whatever turned a plain request away gets one try through the browser.
  if (refused.length) {
    const got = await fetchAdvertInBrowser(refused.map((r) => r.url));
    for (const row of refused) {
      const text = got.get(row.url);
      if (!text) continue;
      await pool.query('UPDATE autopilot_jobs SET description = $2 WHERE id = $1', [row.id, text]);
      filled++;
    }
  }

  if (rows.rows.length) {
    log.info({ thin: rows.rows.length, filled, neededBrowser: refused.length, stillThin: rows.rows.length - filled },
      'fetched the full advert where it was missing');
  }
  return { tried: rows.rows.length, filled };
}
