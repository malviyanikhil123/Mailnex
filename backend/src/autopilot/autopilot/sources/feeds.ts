import type { RawJob } from '../normalize.js';

/** Small helper: fetch JSON with a timeout and a polite user agent. */
export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000, tries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await once<T>(url, init, timeoutMs);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // A 404 means the address is wrong — no point trying again.
      if (message.startsWith('404')) break;
      if (attempt < tries) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastError;
}

async function once<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ac.signal,
      headers: { 'user-agent': 'job-autopilot/0.1 (personal job search)', accept: 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const strip = (html?: string | null) =>
  (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim() || null;

/* ---------------- Remote-first boards: open feeds, no key ---------------- */

export async function remotive(search?: string): Promise<RawJob[]> {
  type R = { jobs: Array<{ id: number; title: string; company_name: string; candidate_required_location: string; description: string; url: string; publication_date: string; salary: string }> };
  const where = search ? `search=${encodeURIComponent(search)}` : 'category=software-dev';
  const data = await getJson<R>(`https://remotive.com/api/remote-jobs?${where}&limit=100`);
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    companyName: j.company_name,
    location: j.candidate_required_location || 'Remote',
    description: strip(j.description),
    url: j.url,
    applyKind: 'company site',
    salaryText: j.salary || null,
    postedAt: j.publication_date ? new Date(j.publication_date) : null,
    sourceKey: 'remotive',
    sourceJobId: String(j.id),
  }));
}

export async function remoteok(): Promise<RawJob[]> {
  type R = Array<{ id?: string; slug?: string; position?: string; company?: string; location?: string; description?: string; url?: string; date?: string; salary_min?: number; salary_max?: number }>;
  const data = await getJson<R>('https://remoteok.com/api');
  return data
    .filter((j) => j.position && j.company && j.url)
    .map((j) => ({
      title: j.position!,
      companyName: j.company!,
      location: j.location || 'Remote',
      description: strip(j.description),
      url: j.url!,
      applyKind: 'company site',
      salaryText: j.salary_min ? `${j.salary_min}–${j.salary_max ?? ''} USD` : null,
      postedAt: j.date ? new Date(j.date) : null,
      sourceKey: 'remoteok',
      sourceJobId: j.id ?? j.slug ?? null,
    }));
}

export async function arbeitnow(): Promise<RawJob[]> {
  type R = { data: Array<{ slug: string; title: string; company_name: string; location: string; description: string; url: string; remote: boolean; created_at: number; tags: string[] }> };
  const data = await getJson<R>('https://www.arbeitnow.com/api/job-board-api');
  return (data.data ?? []).map((j) => ({
    title: j.title,
    companyName: j.company_name,
    location: j.remote ? `Remote · ${j.location}` : j.location,
    description: strip(j.description),
    url: j.url,
    applyKind: 'company site',
    postedAt: j.created_at ? new Date(j.created_at * 1000) : null,
    sourceKey: 'arbeitnow',
    sourceJobId: j.slug,
    raw: { tags: j.tags },
  }));
}

export async function himalayas(): Promise<RawJob[]> {
  type R = { jobs: Array<{ guid: string; title: string; companyName: string; locationRestrictions?: string[]; excerpt?: string; description?: string; applicationLink?: string; pubDate?: number }> };
  const data = await getJson<R>('https://himalayas.app/jobs/api?limit=100');
  return (data.jobs ?? [])
    .filter((j) => j.applicationLink)
    .map((j) => ({
      title: j.title,
      companyName: j.companyName,
      location: j.locationRestrictions?.length ? `Remote · ${j.locationRestrictions.join(', ')}` : 'Remote',
      description: strip(j.description ?? j.excerpt),
      url: j.applicationLink!,
      applyKind: 'company site',
      postedAt: j.pubDate ? new Date(j.pubDate * 1000) : null,
      sourceKey: 'himalayas',
      sourceJobId: j.guid,
    }));
}

/* ---------------- Company career pages (ATS), open feeds, no key ---------------- */

export async function greenhouse(board: string, companyName: string): Promise<RawJob[]> {
  type R = { jobs: Array<{ id: number; title: string; location: { name: string }; absolute_url: string; updated_at: string; content?: string }> };
  const data = await getJson<R>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    companyName,
    location: j.location?.name ?? null,
    description: strip(j.content),
    url: j.absolute_url,
    applyKind: 'greenhouse',
    postedAt: j.updated_at ? new Date(j.updated_at) : null,
    sourceKey: 'greenhouse',
    sourceJobId: String(j.id),
  }));
}

export async function lever(board: string, companyName: string): Promise<RawJob[]> {
  type R = Array<{ id: string; text: string; categories?: { location?: string; commitment?: string }; descriptionPlain?: string; hostedUrl: string; createdAt?: number }>;
  const data = await getJson<R>(`https://api.lever.co/v0/postings/${board}?mode=json`);
  return (data ?? []).map((j) => ({
    title: j.text,
    companyName,
    location: j.categories?.location ?? null,
    description: j.descriptionPlain ? j.descriptionPlain.replace(/\s+/g, ' ').trim() : null,
    url: j.hostedUrl,
    applyKind: 'lever',
    postedAt: j.createdAt ? new Date(j.createdAt) : null,
    sourceKey: 'lever',
    sourceJobId: j.id,
  }));
}

export async function ashby(board: string, companyName: string): Promise<RawJob[]> {
  type R = { jobs: Array<{ id: string; title: string; location?: string; descriptionPlain?: string; jobUrl: string; publishedAt?: string }> };
  const data = await getJson<R>(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`);
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    companyName,
    location: j.location ?? null,
    description: j.descriptionPlain?.replace(/\s+/g, ' ').trim() ?? null,
    url: j.jobUrl,
    applyKind: 'ashby',
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    sourceKey: 'ashby',
    sourceJobId: j.id,
  }));
}

/* ---------------- Worldwide APIs (need a free key) ---------------- */

export async function adzuna(appId: string, appKey: string, country: string, what: string): Promise<RawJob[]> {
  type R = { results: Array<{ id: string; title: string; company: { display_name: string }; location: { display_name: string }; description: string; redirect_url: string; created: string; salary_min?: number; salary_max?: number }> };
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=50&what=${encodeURIComponent(what)}&max_days_old=7&content-type=application/json`;
  const data = await getJson<R>(url);
  return (data.results ?? []).map((j) => ({
    title: j.title.replace(/<[^>]+>/g, ''),
    companyName: j.company?.display_name ?? 'Unknown',
    location: j.location?.display_name ?? null,
    description: strip(j.description),
    url: j.redirect_url,
    applyKind: 'aggregator',
    salaryText: j.salary_min ? `${Math.round(j.salary_min)}–${Math.round(j.salary_max ?? j.salary_min)}` : null,
    postedAt: j.created ? new Date(j.created) : null,
    sourceKey: `adzuna-${country}`,
    sourceJobId: String(j.id),
  }));
}

export async function jooble(key: string, keywords: string, location: string, pages = 3): Promise<RawJob[]> {
  type J = { id: number; title: string; company: string; location: string; snippet: string; link: string; updated: string; salary: string };
  type R = { jobs: J[]; totalCount?: number };

  // Jooble hands back 30 at a time, so we walk a few pages instead of taking the first
  // handful and calling it a day. Locations must read "City, Country" — a bare city
  // name quietly returns nothing at all.
  const all: J[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await getJson<R>(`https://jooble.org/api/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keywords, location, page: String(page) }),
    });
    const batch = data.jobs ?? [];
    if (!batch.length) break;              // nothing left
    all.push(...batch);
  }

  const once = new Map<number, J>();
  for (const j of all) once.set(j.id, j);

  return [...once.values()].map((j) => ({
    title: j.title,
    companyName: j.company || 'Unknown',
    location: j.location || location,
    description: strip(j.snippet),
    url: j.link,
    applyKind: 'aggregator',
    salaryText: j.salary || null,
    postedAt: j.updated ? new Date(j.updated) : null,
    sourceKey: 'jooble',
    sourceJobId: String(j.id),
  }));
}


/* ---------------- More open boards, no key needed ---------------- */

export async function jobicy(): Promise<RawJob[]> {
  type R = { jobs: Array<{ id: number; jobTitle: string; companyName: string; jobGeo: string; jobDescription: string; url: string; pubDate: string; annualSalaryMin?: number; salaryCurrency?: string }> };
  const data = await getJson<R>('https://jobicy.com/api/v2/remote-jobs?count=50');
  return (data.jobs ?? []).map((j) => ({
    title: j.jobTitle,
    companyName: j.companyName,
    location: j.jobGeo ? `Remote · ${j.jobGeo}` : 'Remote',
    description: strip(j.jobDescription),
    url: j.url,
    applyKind: 'company site',
    salaryText: j.annualSalaryMin ? `${j.annualSalaryMin} ${j.salaryCurrency ?? ''}`.trim() : null,
    postedAt: j.pubDate ? new Date(j.pubDate) : null,
    sourceKey: 'jobicy',
    sourceJobId: String(j.id),
  }));
}

export async function landingJobs(): Promise<RawJob[]> {
  type R = Array<{ id: number; title: string; company_name?: string; company?: { name?: string }; city?: string; country?: string; description?: string; url: string; published_at?: string }>;
  const data = await getJson<R>('https://landing.jobs/api/v1/jobs');
  return (data ?? []).map((j) => ({
    title: j.title,
    companyName: j.company_name ?? j.company?.name ?? 'Unknown',
    location: [j.city, j.country].filter(Boolean).join(', ') || null,
    description: strip(j.description),
    url: j.url,
    applyKind: 'company site',
    postedAt: j.published_at ? new Date(j.published_at) : null,
    sourceKey: 'landing-jobs',
    sourceJobId: String(j.id),
  }));
}

/**
 * We Work Remotely publishes RSS rather than JSON. The feed is small and its shape is
 * fixed, so it is read with a plain pattern rather than pulling in an XML library.
 */
export async function weWorkRemotely(): Promise<RawJob[]> {
  const res = await fetch('https://weworkremotely.com/remote-jobs.rss', {
    headers: { 'user-agent': 'job-autopilot/0.1 (personal job search)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const xml = await res.text();

  const out: RawJob[] = [];
  for (const block of xml.split('<item>').slice(1)) {
    // Read one tag out of the block by hand. A regex built from a string is easy to get
    // subtly wrong here, and this is plainer to follow.
    const pick = (tag: string): string | null => {
      const from = block.indexOf(`<${tag}>`);
      if (from < 0) return null;
      const to = block.indexOf(`</${tag}>`, from);
      if (to < 0) return null;
      return block
        .slice(from + tag.length + 2, to)
        .replace('<![CDATA[', '')
        .replace(']]>', '')
        .trim() || null;
    };
    const rawTitle = pick('title');
    const url = pick('link');
    if (!rawTitle || !url) continue;

    // Titles read "Company: Role" — split them so the company is not lost inside the title.
    const [maybeCompany, ...rest] = rawTitle.split(':');
    const title = rest.length ? rest.join(':').trim() : rawTitle;
    const companyName = rest.length ? maybeCompany!.trim() : (pick('region') ?? 'Unknown');

    out.push({
      title,
      companyName,
      location: pick('region') ?? 'Remote',
      description: strip(pick('description')),
      url,
      applyKind: 'company site',
      postedAt: pick('pubDate') ? new Date(pick('pubDate')!) : null,
      sourceKey: 'weworkremotely',
      sourceJobId: url.split('/').pop() ?? null,
    });
  }
  return out;
}
