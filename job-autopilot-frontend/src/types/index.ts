export interface Me {
  id: number;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
}

export interface Profile {
  id?: number;
  full_name: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  seniority?: string;
  years_experience?: string;
  degree?: string;
  degree_level?: string;
  grad_year?: number;
  target_roles?: string[];
  skills?: string[];
  salary_floor?: number | null;
  salary_currency?: string | null;
  salary_note?: string;
  never_contact?: string[];
  resume_text?: string;
  knockouts?: {
    maxYearsAsked?: number;
    degreeLevelsThatFail?: string[];
    [key: string]: any;
  };
  updated_at?: string;
}

export interface Settings {
  userId?: number;
  targetRoles?: string[];
  countries?: string[];
  maxAgeDays?: number;
  salaryFloor?: number | null;
  salaryCurrency?: string | null;
  currentEmployer?: string | null;
  gmailEmail?: string | null;
  hasMailbox?: boolean;
}

export interface JobScorePart {
  part: string;
  got: number;
  of: number;
  why: string;
}

export interface JobItem {
  id: number;
  title: string;
  company_name: string;
  location?: string;
  country?: string;
  remote: boolean;
  url: string;
  salary_text?: string;
  posted_at?: string;
  first_seen_at?: string;
  source_key: string;
  role_match?: boolean;
  score?: number | null;
  verdict?: string | null;
  confidence?: string | null;
  summary?: string | null;
  parts?: JobScorePart[] | null;
  knockouts?: string[] | null;
}

export interface StatsResponse {
  totals: {
    jobs: number;
    today: number;
    pool: number;
    companies: number;
    countries: number;
  };
  byCountry: Array<{ country: string; n: number }>;
  sources: Array<{
    label: string;
    kind: string;
    found: number;
    added: number;
    last_result: string | null;
    last_run_at: string | null;
  }>;
  daily: Array<{ day: string; n: number }>;
}

export interface RunItem {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  found: number;
  added: number;
  note: string | null;
}

export interface RunsResponse {
  runs: RunItem[];
  due: {
    running?: boolean;
    next?: string | null;
    overdue?: boolean;
  };
  everyMinutes: number;
}

export interface AccountNeeded {
  id: number;
  platform: string;
  label: string;
  scope: string;
  employer?: string | null;
  signup_url?: string | null;
  jobs_blocked: number;
  state: 'asking' | 'approved' | 'created' | 'skipped';
  note?: string | null;
}

export interface AccountsResponse {
  accounts: AccountNeeded[];
  blocked: number;
  waiting: number;
}

export interface ApprovalItem {
  companyName: string;
  jobTitle: string;
  location?: string;
  salaryText?: string;
  url?: string;
  score?: number;
  verdict?: string;
  summary?: string;
  whyCompany?: string;
  resumeHtml?: string;
  coverLetter?: string;
  state?: string;
}
