import crypto from 'node:crypto';

/** The one shape every source is turned into, whatever it looked like originally. */
export type RawJob = {
  title: string;
  companyName: string;
  location?: string | null;
  description?: string | null;
  url: string;
  applyKind?: string | null;
  salaryText?: string | null;
  postedAt?: Date | null;
  sourceKey: string;
  sourceJobId?: string | null;
  raw?: Record<string, unknown>;
};

export type NormalJob = RawJob & {
  country: string;
  roleMatch?: boolean;
  remote: boolean;
  fingerprint: string;
  companySlug: string;
};

const COUNTRY_WORDS: Array<[RegExp, string]> = [
  // India first — it is the home market
  [/\b(india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|noida|gurgaon|gurugram|kolkata|ahmedabad|jaipur|jodhpur|indore)\b/i, 'in'],
  // Asia and the Gulf
  [/\b(singapore)\b/i, 'sg'],
  [/\b(united arab emirates|\buae\b|dubai|abu dhabi|sharjah)\b/i, 'ae'],
  [/\b(qatar|doha)\b/i, 'qa'],
  [/\b(saudi arabia|saudi|riyadh|jeddah|dammam)\b/i, 'sa'],
  [/\b(malaysia|kuala lumpur)\b/i, 'my'],
  [/\b(indonesia|jakarta|bali)\b/i, 'id'],
  [/\b(philippines|manila|cebu)\b/i, 'ph'],
  [/\b(thailand|bangkok)\b/i, 'th'],
  [/\b(vietnam|viet nam|hanoi|ho chi minh)\b/i, 'vn'],
  [/\b(japan|tokyo|osaka)\b/i, 'jp'],
  [/\b(hong kong)\b/i, 'hk'],
  [/\b(south korea|korea|seoul)\b/i, 'kr'],
  [/\b(t[üu]rkiye|turkey|istanbul|ankara)\b/i, 'tr'],
  [/\b(israel|tel aviv|jerusalem)\b/i, 'il'],
  // Africa
  [/\b(south africa|johannesburg|cape town|pretoria|durban)\b/i, 'za'],
  [/\b(kenya|nairobi|mombasa)\b/i, 'ke'],
  [/\b(nigeria|lagos|abuja)\b/i, 'ng'],
  [/\b(ivory coast|c[ôo]te d.?ivoire|abidjan|yamoussoukro)\b/i, 'ci'],
  [/\b(egypt|cairo|alexandria)\b/i, 'eg'],
  [/\b(morocco|casablanca|rabat|marrakech)\b/i, 'ma'],
  [/\b(ghana|accra)\b/i, 'gh'],
  [/\b(rwanda|kigali)\b/i, 'rw'],
  [/\b(senegal|dakar)\b/i, 'sn'],
  [/\b(tanzania|dar es salaam|uganda|kampala|ethiopia|addis ababa|zambia|lusaka)\b/i, 'af'],
  // Europe
  [/\b(united kingdom|england|scotland|wales|london|manchester|edinburgh|\buk\b)\b/i, 'gb'],
  [/\b(ireland|dublin)\b/i, 'ie'],
  [/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|stuttgart)\b/i, 'de'],
  [/\b(netherlands|amsterdam|rotterdam|utrecht|eindhoven|the hague)\b/i, 'nl'],
  [/\b(france|paris|lyon|toulouse|bordeaux)\b/i, 'fr'],
  [/\b(spain|madrid|barcelona|valencia|m[áa]laga)\b/i, 'es'],
  [/\b(italy|milan|rome|turin|bologna)\b/i, 'it'],
  [/\b(poland|warsaw|krak[oó]w|wroc[lł]aw|gda[nń]sk)\b/i, 'pl'],
  [/\b(switzerland|zurich|zürich|geneva|basel|lausanne)\b/i, 'ch'],
  [/\b(sweden|stockholm|gothenburg|malm[öo])\b/i, 'se'],
  [/\b(portugal|lisbon|lisboa|porto)\b/i, 'pt'],
  [/\b(norway|oslo)\b/i, 'no'],
  [/\b(denmark|copenhagen|k[oø]benhavn)\b/i, 'dk'],
  [/\b(finland|helsinki)\b/i, 'fi'],
  [/\b(czech|czechia|prague|brno)\b/i, 'cz'],
  [/\b(romania|bucharest|cluj)\b/i, 'ro'],
  [/\b(greece|athens|thessaloniki)\b/i, 'gr'],
  [/\b(belgium|brussels|antwerp|austria|vienna|hungary|budapest)\b/i, 'eu'],
  // Elsewhere — kept so the country is known even when it is not on your list
  // The United States, spelt the many ways job boards spell it. Two-letter state codes
  // are what aggregators actually print ("Plano, TX"), and without them most American
  // adverts were filed as "unknown" and lost.
  [/\b(united states|\busa\b|\bu\.s\.a?\b|\bus\b|washington,? ?d\.?c\.?|new york|brooklyn|san francisco|los angeles|san diego|san jose|seattle|austin|dallas|houston|boston|chicago|atlanta|denver|phoenix|philadelphia|miami|orlando|tampa|charlotte|raleigh|nashville|detroit|minneapolis|kansas city|salt lake|las vegas|portland|sacramento|columbus|cleveland|cincinnati|pittsburgh|baltimore|richmond|arlington|alexandria|plano|irving|frisco|reston|mclean|herndon|chantilly|huntsville)\b/i, 'us'],
  [/,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/, 'us'],
  [/\b(canada|toronto|vancouver|montreal|ottawa)\b/i, 'ca'],
  [/\b(australia|sydney|melbourne|brisbane|new zealand|auckland)\b/i, 'au'],
  [/\b(brazil|s[ãa]o paulo|mexico|argentina|colombia|chile)\b/i, 'latam'],
];

const REMOTE = /\b(remote|work from home|wfh|anywhere|distributed)\b/i;

/** Punctuation and case removed, so "Razorpay Pvt. Ltd." and "razorpay" match. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|inc|llc|llp|gmbh|bv|plc|technologies|technology|labs|software|solutions)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/** Same job on Adzuna, Jooble and the company's own page collapses to one fingerprint. */
export function fingerprintOf(companyName: string, title: string, country: string): string {
  const title_ = title
    .toLowerCase()
    .replace(/\b(sr|snr)\b/g, 'senior')
    .replace(/\b(jr)\b/g, 'junior')
    .replace(/\b(dev|developer)\b/g, 'developer')
    .replace(/\b(eng|engineer)\b/g, 'engineer')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return crypto.createHash('sha1').update(`${slugify(companyName)}|${title_}|${country}`).digest('hex');
}

export function normalize(job: RawJob): NormalJob {
  const haystack = `${job.location ?? ''} ${job.title} ${job.description?.slice(0, 400) ?? ''}`;
  const remote = REMOTE.test(job.location ?? '') || REMOTE.test(job.title);
  let country = 'unknown';
  for (const [re, code] of COUNTRY_WORDS) {
    if (re.test(haystack)) { country = code; break; }
  }
  if (country === 'unknown' && remote) country = 'remote';
  return {
    ...job,
    country,
    remote,
    companySlug: slugify(job.companyName),
    fingerprint: fingerprintOf(job.companyName, job.title, country),
  };
}

/** Your current employer must never be applied to, or even stored as a target. */
export function isBlocked(job: NormalJob, blocked: string[]): boolean {
  if (!job.companySlug) return false;
  return blocked.some((b) => b && (job.companySlug.includes(b) || b.includes(job.companySlug)));
}

/** Only the countries the user picked, plus worldwide-remote roles. */
export function wanted(job: NormalJob, countries: string[]): boolean {
  if (countries.includes('all')) return true;
  if (job.remote && countries.includes('remote')) return true;
  return countries.includes(job.country);
}

/* ---------------- Is this the kind of job you want, and is it still open? ---------------- */

/**
 * Titles that count as your family of work. Built from the roles in .env plus the
 * short forms boards actually use. Matching is on the title only — a description
 * mentioning "business analyst" is usually about who you will work with, not the job.
 */
const ALSO = [
  'business analyst', 'business systems analyst', 'systems analyst', 'it analyst', 'technical analyst',
  'functional analyst', 'functional consultant', 'requirements analyst', 'requirement analyst',
  'product analyst', 'product owner', 'process analyst', 'business process', 'data analyst',
  'associate product manager', 'business consultant', 'crm analyst', 'erp analyst', 'reporting analyst',
];

const NOT_FOR_YOU = /(intern|internship|trainee|principal|director|vp |vice president|head of|chief|architect|staff engineer|engineering manager)/i;

export function roleWords(roles: string[]): string[] {
  return [...new Set([...roles, ...ALSO].map((r) => r.toLowerCase().trim()).filter(Boolean))];
}

/** True when the title is in your family of work. */
export function matchesRole(job: NormalJob, words: string[]): boolean {
  const title = job.title.toLowerCase();
  if (NOT_FOR_YOU.test(title)) return false;
  if (/\bba\b|\bbsa\b/.test(title) && /analyst|analysis/.test(title)) return true;
  return words.some((w) => title.includes(w));
}

/** Old adverts are usually filled. Anything without a date is given the benefit of the doubt. */
export function isFresh(job: NormalJob, maxDays: number): boolean {
  if (!job.postedAt) return true;
  const days = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000;
  return days <= maxDays;
}
