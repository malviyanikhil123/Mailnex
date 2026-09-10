export type EmailCategory =
  | "HR"
  | "Recruitment"
  | "Careers"
  | "IT"
  | "Accounts"
  | "Finance"
  | "Sales"
  | "General"
  | "Other"
  | "Unknown";

export type DiscoveryJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface DiscoveryJob {
  id: number;
  userId: number;
  location: string | null;
  profession: string | null;
  keywords: string | null;
  companyType: string | null;
  targetCount: number;
  status: DiscoveryJobStatus;
  companiesFound: number;
  pagesCrawled: number;
  emailsFound: number;
  hrEmailsFound: number;
  duplicatesRemoved: number;
  currentDomain: string | null;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredLead {
  id: number;
  userId: number;
  jobId: number | null;
  email: string;
  normalizedEmail: string;
  name: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companyType: string | null;
  industry: string | null;
  location: string | null;
  emailCategory: EmailCategory;
  classificationConfidence: number;
  sourceUrl: string | null;
  isValid: boolean;
  isDuplicate: boolean;
  isImported: boolean;
  importedContactId: number | null;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateDiscoveryJobInput {
  location?: string;
  profession?: string;
  keywords?: string;
  companyType?: string;
  targetCount?: number;
}

export interface ListLeadsQuery {
  jobId?: number;
  emailCategory?: string;
  companyType?: string;
  search?: string;
  isImported?: boolean;
  page?: number;
  limit?: number;
}

export interface DiscoveryMetricSet {
  companiesFound: number;
  pagesCrawled: number;
  emailsFound: number;
  hrEmailsFound: number;
  itEmailsFound: number;
  accountsEmailsFound: number;
  otherEmailsFound: number;
  duplicatesRemoved: number;
}

export interface DiscoveryStats {
  today: DiscoveryMetricSet;
  yesterday: DiscoveryMetricSet;
  last7Days: DiscoveryMetricSet;
  last30Days: DiscoveryMetricSet;
  dailyTrend: Array<{
    date: string;
    emailsFound: number;
    hrEmails: number;
    companies: number;
  }>;
}

export interface ImportLeadsResponse {
  imported: number;
  skipped: number;
}
