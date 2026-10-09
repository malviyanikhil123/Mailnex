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
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  /** Legacy single-name field of older contacts; imports fill first/last name. */
  contactPerson: string | null;
  /** Extra spreadsheet columns, usable in templates as {{key}}. */
  customFields: Record<string, string>;
  importId: number | null;
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
  name: string | null;
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  invalidRows: number;
  /** Keys of the extra columns stored on this import's contacts ({{key}} variables). */
  customFieldKeys?: string[];
  createdAt: string;
  /** Contacts that currently belong to this import (listing endpoint only). */
  contactCount?: number;
  pendingCount?: number;
}

/** A file a template can attach to its emails (Settings → Documents). */
export interface UserDocument {
  id: number;
  name: string;
  /** Original file name, also used as the attachment name. */
  fileName: string;
  createdAt: string;
}

/** Upload limits, enforced by the server and mirrored in the UI. */
export interface DocumentLimits {
  maxDocuments: number;
  maxBytes: number;
  /** Allowed extensions, lower-case without the dot. */
  extensions: string[];
}

export interface DocumentList {
  documents: UserDocument[];
  limits: DocumentLimits;
}

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: string;
  version: number;
  active: boolean;
  documentId?: number | null;
  document?: Pick<UserDocument, "id" | "name" | "fileName"> | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignMode = "DRAFT" | "TEST" | "LIVE";
export type CampaignState = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";

/** Editable campaign fields (create / update payload). */
export interface CampaignInput {
  name: string;
  importId: number | null;
  /** null = the primary Gmail from Settings. */
  senderAccountId: number | null;
  templateIds: number[];
  mode: CampaignMode;
  dailyLimit: number;
  startHour: number;
  endHour: number;
  testEmail: string | null;
  language: string;
  aiEnabled: boolean;
  aiInstructions: string | null;
  /** null = the user's default AI provider. */
  aiProvider: AiProviderId | null;
  /** null = the provider's saved model; only set together with aiProvider. */
  aiModel: string | null;
}

export interface Campaign extends CampaignInput {
  id: number;
  state: CampaignState;
  importName: string | null;
  quotaToday: number;
  nextScheduledAt: string | null;
  countsByStatus: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface SenderAccount {
  id: number;
  label: string;
  email: string;
  dailyLimit: number;
  active: boolean;
  createdAt: string;
}

export type AiProviderId = "openai" | "anthropic" | "google" | "groq";

/** One AI provider as GET /ai-providers lists it. The API key itself is never returned. */
export interface AiProviderStatus {
  provider: AiProviderId;
  label: string;
  configured: boolean;
  /** Last 4 characters of the saved key. */
  keyLast4: string | null;
  /** The saved model, or the recommended one while not configured. */
  defaultModel: string;
  isDefault: boolean;
  /** Curated models; the first is the recommended one. */
  models: string[];
  keyUrl: string;
  updatedAt: string | null;
}

export interface ProfileField {
  key: string;
  label: string;
  value: string;
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

/** The sender's "My Profile"; templates use it as {{my_name}}, {{my_company}}, … {{signature}}. */
export interface SenderProfile {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  /** Multi-line; when empty the server builds one from name, company, phone and website. */
  signature?: string;
}

export interface PublicSettings {
  emailProvider: string;
  gmailEmail: string | null;
  gmailConfigured: boolean;
  /** True when at least one AI provider key is saved. */
  aiConfigured: boolean;
  profile: SenderProfile;
  /** Daily cap of the primary Gmail, shared by every campaign sending from it. */
  senderDailyLimit: number;
  profileFields: ProfileField[];
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
