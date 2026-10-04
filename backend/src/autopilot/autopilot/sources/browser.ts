import type { Browser, BrowserContext } from 'playwright';
import type { RawJob } from '../normalize.js';
import { log } from '../../shared/log.js';

/**
 * Sources that only answer to a real browser.
 *
 * hiring.cafe sits behind Cloudflare and turns away plain server-side fetch with a
 * "Just a moment..." page, so there is no honest way to read it except by driving a
 * headless Chromium on this machine.
 */

/* ---- what a hiring.cafe listing looks like once the page has rendered ---- */

type Hit = {
  id?: string;
  source?: string;
  apply_url?: string;
  is_expired?: boolean;
  job_information?: { title?: string };
  v5_processed_job_data?: {
    core_job_title?: string;
    company_name?: string;
    requirements_summary?: string;
    role_activities?: string[];
    seniority_level?: string;
    commitment?: string[];
    workplace_type?: string;
    formatted_workplace_location?: string;
    workplace_cities?: string[];
    workplace_countries?: string[];
    estimated_publish_date_millis?: number;
    estimated_publish_date?: string;
    is_compensation_transparent?: boolean;
    listed_compensation_currency?: string;
    yearly_min_compensation?: number | null;
    yearly_max_compensation?: number | null;
    monthly_min_compensation?: number | null;
    monthly_max_compensation?: number | null;
    hourly_min_compensation?: number | null;
    hourly_max_compensation?: number | null;
  };
  enriched_company_data?: { name?: string };
};

type PageProps = { ssrHits?: Hit[]; ssrIsLastPage?: boolean; ssrTotalCount?: number };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Adverts, analytics and fonts are a third of the page weight and none of it is the job
// data, so they are refused outright. It is faster and lighter on the site.
const JUNK = /doubleclick|googlesyndication|google-analytics|googletagmanager|adtrafficquality|recaptcha|gstatic|fonts\.googleapis|sentry/i;

/** True when Playwright is installed and its Chromium has actually been downloaded. */
export async function browserReady(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const { existsSync } = await import('node:fs');
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/* ---- hiring.cafe ---- */

/**
 * One search, walked a few pages deep.
 *
 * The listings are already in the server-rendered page as `__NEXT_DATA__`, so there is
 * nothing to scrape out of the DOM and nothing to wait for beyond the HTML itself.
 * The catch is paging: asking the same browser session for a second page trips
 * Cloudflare, while a clean session per page is waved through. Contexts are cheap,
 * so each page gets its own.
 */
export async function hiringCafe(role: string, pages = 5): Promise<RawJob[]> {
  const { chromium } = await import('playwright');
  const depth = Math.min(Math.max(pages, 1), 5);   // five pages is already ~450 adverts
  const state = JSON.stringify({ searchQuery: role });

  const browser: Browser = await chromium.launch({ headless: true });
  const byId = new Map<string, Hit>();

  try {
    for (let page = 0; page < depth; page++) {
      // Give the site a breather between pages rather than hammering it.
      if (page) await new Promise((r) => setTimeout(r, 1500));

      const ctx: BrowserContext = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
      try {
        const tab = await ctx.newPage();
        await tab.route('**/*', (route) => {
          const req = route.request();
          if (JUNK.test(req.url()) || ['image', 'media', 'font'].includes(req.resourceType())) return route.abort();
          return route.continue();
        });

        const url = `https://hiring.cafe/?searchState=${encodeURIComponent(state)}${page ? `&page=${page}` : ''}`;
        const res = await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        // A 403 here is the Cloudflare interstitial. Nothing useful follows it, so stop —
        // but say so, otherwise a half-finished sweep looks like a thin search.
        if (!res || !res.ok()) {
          log.warn({ role, page, status: res?.status() ?? 'no response' }, 'hiring.cafe turned us away — stopping early');
          break;
        }

        // Read the script tag out and parse it here rather than inside the page — this
        // project's TypeScript has no DOM library, and there is no need for one.
        const blob = await tab.locator('#__NEXT_DATA__').first().textContent({ timeout: 30_000 }).catch(() => null);
        if (!blob) break;
        const props = (JSON.parse(blob) as { props?: { pageProps?: PageProps } }).props?.pageProps;

        const hits = props?.ssrHits ?? [];
        if (!hits.length) break;
        for (const h of hits) if (h.id) byId.set(h.id, h);
        if (props?.ssrIsLastPage) break;
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  return [...byId.values()].filter((h) => !h.is_expired).map(toRawJob).filter((j): j is RawJob => j !== null);
}

function toRawJob(h: Hit): RawJob | null {
  const v = h.v5_processed_job_data ?? {};
  const title = h.job_information?.title?.trim() || v.core_job_title?.trim();
  const company = v.company_name?.trim() || h.enriched_company_data?.name?.trim();
  const url = h.apply_url;
  if (!title || !company || !url) return null;

  const place = v.formatted_workplace_location?.trim() || v.workplace_cities?.join(' · ') || v.workplace_countries?.join(', ') || null;
  // The country reader downstream only knows a job is remote if the word is in the
  // location, and hiring.cafe keeps that in a field of its own. So say it out loud.
  const remote = /remote/i.test(v.workplace_type ?? '');
  const location = remote ? (place ? `Remote · ${place}` : 'Remote') : place;

  const summary = [v.requirements_summary, v.role_activities?.length ? `Day to day: ${v.role_activities.join(', ')}.` : null]
    .filter(Boolean)
    .join(' ')
    .trim();

  const millis = v.estimated_publish_date_millis ?? (v.estimated_publish_date ? Date.parse(v.estimated_publish_date) : NaN);

  return {
    title,
    companyName: company,
    location,
    description: summary || null,
    url,
    applyKind: applyKindOf(h.source),
    salaryText: payOf(v),
    postedAt: Number.isFinite(millis) ? new Date(millis as number) : null,
    sourceKey: 'hiring-cafe',
    sourceJobId: h.id ?? null,
    raw: { board: h.source, seniority: v.seniority_level, commitment: v.commitment },
  };
}

/** hiring.cafe names the underlying board; match the words the other sources already use. */
function applyKindOf(source?: string): string {
  if (!source) return 'aggregator';
  const known: Record<string, string> = { grnhse: 'greenhouse', greenhouse: 'greenhouse', lever: 'lever', ashby: 'ashby' };
  return known[source] ?? source;
}

/** Only quote pay the employer actually published — the rest is hiring.cafe's guesswork. */
function payOf(v: Hit['v5_processed_job_data'] & {}): string | null {
  if (!v.is_compensation_transparent) return null;
  const currency = v.listed_compensation_currency ?? '';
  const bands: Array<[number | null | undefined, number | null | undefined, string]> = [
    [v.yearly_min_compensation, v.yearly_max_compensation, 'a year'],
    [v.monthly_min_compensation, v.monthly_max_compensation, 'a month'],
    [v.hourly_min_compensation, v.hourly_max_compensation, 'an hour'],
  ];
  for (const [min, max, per] of bands) {
    if (!min && !max) continue;
    const low = Math.round(min ?? max ?? 0);
    const high = Math.round(max ?? min ?? 0);
    const range = low === high ? `${low}` : `${low}–${high}`;
    return `${range} ${currency} ${per}`.replace(/\s+/g, ' ').trim();
  }
  return null;
}
