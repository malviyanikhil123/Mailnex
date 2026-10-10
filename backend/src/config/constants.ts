export const LIMITS = {
  DAILY: 50, START_HOUR: 9, END_HOUR: 18, MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [3_600_000, 21_600_000, 86_400_000] as const,
  /** Default daily cap of the primary Gmail across all campaigns sending from it. */
  PRIMARY_SENDER_DAILY: 100,
  /** Documents (files templates attach to emails): count per user, size per file, file types. */
  DOCUMENTS_PER_USER: 10,
  DOCUMENT_MAX_BYTES: 5 * 1024 * 1024,
  DOCUMENT_EXTENSIONS: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "png", "jpg", "jpeg"],
  /** Largest template body (UTF-8 bytes), plain text or HTML. */
  TEMPLATE_BODY_MAX_BYTES: 100 * 1024,
} as const;

/**
 * Template variables the app fills itself. Custom profile fields may not use these keys,
 * and an imported column with one of these names is stored as contact_<name> instead.
 */
export const BUILTIN_TEMPLATE_VARS = [
  // sender ("My Profile")
  "my_name", "my_company", "my_email", "my_phone", "my_website", "my_linkedin", "signature",
  // contact
  "company", "location", "first_name", "last_name", "full_name",
  "contact_email", "contact_phone", "contact_website",
  // legacy sender variables, still filled for older templates
  "candidateName", "name", "candidateEmail", "email", "phone",
  "role", "targetRole", "experience", "skills", "linkedin", "LinkedIn", "github",
  "GitHub", "portfolio", "Portfolio",
] as const;

export const INBOX = {
  SYNC_WINDOW_DAYS: 30,
  RETENTION_DAYS: 35,
  TRASH_RETENTION_DAYS: 7,
  TRASH_PENDING_STALE_MS: 600_000,
  MAX_MESSAGES_PER_SYNC: 200,
  MAX_TEXT_CHARS: 8_000,
  SNIPPET_CHARS: 300,
  AI_BATCH_SIZE: 15,
  AI_TEXT_CHARS: 1_200,
  AI_MAX_BATCHES_PER_RUN: 6,
  AI_BATCH_DELAY_MS: 1_000,
  SYNC_CRON: "*/10 * * * *",
  SYNC_CONCURRENCY: 2,
  BACKOFF_MS: [300_000, 900_000, 3_600_000, 21_600_000, 86_400_000] as const,
  HARD_FAIL_BACKOFF_MS: 86_400_000,
} as const;
