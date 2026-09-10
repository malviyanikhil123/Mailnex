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

export type ContactStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "BOUNCED"
  | "PAUSED";

export interface Contact {
  id: number;
  companyName: string;
  location: string | null;
  email: string;
  contactPerson: string | null;
  status: ContactStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastContactedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportSummary {
  id: number;
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  invalidRows: number;
  createdAt: string;
}

export interface Resume {
  id: number;
  name: string;
  fileName: string;
  createdAt: string;
}

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: string;
  version: number;
  active: boolean;
  resumeId?: number | null;
  resume?: Resume | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignMode = "DRAFT" | "TEST" | "LIVE";
export type CampaignState = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";

export interface CampaignStatus {
  state: CampaignState;
  mode: CampaignMode;
  quotaToday: number;
  dailyLimit: number;
  nextScheduledAt: string | null;
  countsByStatus: Record<string, number>;
}

export interface EmailLogRow {
  id: number;
  contactId: number | null;
  companyName: string | null;
  email: string | null;
  subject: string;
  mode: string;
  status: string;
  failureType: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  aiUsed: boolean;
  sentAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalContacts: number;
  pending: number;
  sent: number;
  failed: number;
  bounced: number;
  emailsSentToday: number;
  successRate: number;
  failureRate: number;
  totalImportedContacts: number;
  totalEmailsGenerated: number;
  totalEmailsSent: number;
  totalBounced: number;
  totalFailed: number;
  aiUsagePercent: number;
  averageEmailsPerDay: number;
  importHistory: ImportSummary[];
}

export interface TrendPoint {
  bucket: string;
  sent: number;
  failed: number;
}

export interface CandidateProfile {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  experience?: string;
  skills?: string[];
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface PublicSettings {
  emailProvider: string;
  gmailEmail: string | null;
  gmailConfigured: boolean;
  geminiConfigured: boolean;
  candidate: CandidateProfile;
  resumeFileName: string | null;
  campaign: {
    mode: CampaignMode;
    state: CampaignState;
    dailyLimit: number;
    startHour: number;
    endHour: number;
    testEmail: string | null;
    enabled: boolean;
  } | null;
}

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

export interface ImportLeadsInput {
  leadIds: number[];
}

export interface ImportLeadsResponse {
  imported: number;
  skipped: number;
}

