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

// ---------------------------------------------------------------------------
// Inbox Sorter
// ---------------------------------------------------------------------------

export type InboxAssignmentSource = "NONE" | "RULE" | "AI" | "MANUAL";
export type InboxMessageState = "ACTIVE" | "TRASH_PENDING" | "TRASHED";
export type InboxRuleField = "FROM_ADDRESS" | "FROM_DOMAIN" | "SUBJECT" | "BODY" | "ANY_TEXT";
export type InboxRuleMatch = "CONTAINS" | "EQUALS" | "STARTS_WITH" | "ENDS_WITH" | "REGEX";
export type InboxSyncStatus = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";

export type JobApplicationStatus =
  | "APPLIED" | "ACKNOWLEDGED" | "RECRUITER_REPLY" | "INTERVIEW_INVITE"
  | "ASSESSMENT" | "OFFER" | "REJECTION" | "WITHDRAWN" | "OTHER";

export interface InboxCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  trackSubStatus: boolean;
  ruleCount: number;
  messageCount: number;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InboxCategoryRule {
  id: number;
  categoryId: number;
  field: InboxRuleField;
  matchType: InboxRuleMatch;
  value: string;
  valueNormalized: string;
  priority: number;
  enabled: boolean;
  subStatus: JobApplicationStatus | null;
  matchCount: number;
  lastMatchedAt: string | null;
}

export interface InboxMessage {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  assignmentSource: InboxAssignmentSource;
  matchedRuleId: number | null;
  /** Pre-rendered, e.g. 'subject contains "interview"'. */
  matchedRuleLabel: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  manualOverride: boolean;
  classifiedAt: string | null;
  jobStatus: JobApplicationStatus | null;
  jobCompany: string | null;
  jobRole: string | null;
  fromName: string | null;
  fromAddress: string;
  fromDomain: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  hasAttachments: boolean;
  state: InboxMessageState;
  deleteError: string | null;
}

export interface InboxMessageDetail extends InboxMessage {
  bodyText: string;
  toAddress: string | null;
  messageId: string | null;
  uid: number;
  mailbox: string;
  sizeBytes: number | null;
  gmailThreadId: string | null;
}

export interface InboxStats {
  total: number;
  uncategorized: number;
  unread: number;
  trashed: number;
  byRule: number;
  byAi: number;
  byManual: number;
  byJobStatus: Array<{ status: JobApplicationStatus | null; count: number }>;
  byCategory: Array<{
    categoryId: number;
    name: string;
    color: string;
    trackSubStatus: boolean;
    count: number;
    unread: number;
  }>;
  lastSyncAt: string | null;
  lastSyncStatus: InboxSyncStatus;
  lastSyncError: string | null;
}

export interface InboxSyncState {
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: InboxSyncStatus;
  lastSyncError: string | null;
  lastSyncErrorCode: string | null;
  consecutiveFailures: number;
  nextAttemptAt: string | null;
  initialSyncDoneAt: string | null;
  messagesFetchedLast: number;
  syncWindowDays: number;
  gmailConfigured: boolean;
}

export interface InboxJobProgress {
  jobId: string;
  kind: "sync" | "classify";
  phase: string;
  processed: number;
  total: number;
  done: boolean;
  result?: InboxSyncResult | InboxClassifyResult;
  error?: string;
}

export interface InboxSyncResult {
  outcome: "ok" | "skipped" | "not_configured" | "error";
  fetched: number;
  inserted: number;
  duplicates: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface InboxClassifyResult {
  outcome: "ok" | "no_categories" | "nothing_to_do";
  examined: number;
  byRule: number;
  byAi: number;
  uncategorized: number;
  skippedManual: number;
  aiCalls: number;
}

export interface InboxRuleTestResult {
  matches: number;
  scanned: number;
  sample: Array<{
    id: number;
    fromAddress: string;
    subject: string;
    snippet: string;
    receivedAt: string;
    categoryId: number | null;
  }>;
}

export interface InboxDeleteResult {
  requested: number;
  trashed: number;
  failed: number;
  failures: Array<{ id: number; error: string }>;
}
