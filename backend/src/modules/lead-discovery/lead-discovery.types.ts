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

export interface ImportLeadsInput {
  leadIds: number[];
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
