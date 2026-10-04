import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import {
  inboxAssignmentSource,
  inboxMessageState,
  inboxRuleField,
  inboxRuleMatch,
  inboxSyncStatus,
  jobApplicationStatus,
} from "./enums.js";

/** User-defined mail categories. "Uncategorized" is categoryId = NULL, never a row. */
export const inboxCategories = pgTable("inbox_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** Fed verbatim to the AI classifier — describes the mail, not the label. */
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#60A5FA"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Enables job-pipeline sub-status tracking on this category. */
  trackSubStatus: boolean("track_sub_status").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqSlugUser: uniqueIndex("inbox_categories_slug_user_unique").on(t.slug, t.userId),
}));

/** Deterministic match rules. Lower priority runs first; first match wins. */
export const inboxCategoryRules = pgTable("inbox_category_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => inboxCategories.id, { onDelete: "cascade" }),
  field: inboxRuleField("field").notNull(),
  matchType: inboxRuleMatch("match_type").notNull().default("CONTAINS"),
  /** As the user typed it — shown in the editor. */
  value: text("value").notNull(),
  /** normalizeForMatch(value) — what matching actually compares. */
  valueNormalized: text("value_normalized").notNull(),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  subStatus: jobApplicationStatus("sub_status"),
  matchCount: integer("match_count").notNull().default(0),
  lastMatchedAt: timestamp("last_matched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqDedupe: uniqueIndex("inbox_category_rules_dedupe_unique")
    .on(t.categoryId, t.field, t.matchType, t.valueNormalized),
  byUserEnabled: index("inbox_category_rules_user_enabled_priority_idx")
    .on(t.userId, t.enabled, t.priority),
}));

export const inboxMessages = pgTable("inbox_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // ---- classification result + provenance ----
  /** NULL = Uncategorized. set null on category delete so mail is re-bucketed, never lost. */
  categoryId: integer("category_id").references(() => inboxCategories.id, { onDelete: "set null" }),
  assignmentSource: inboxAssignmentSource("assignment_source").notNull().default("NONE"),
  matchedRuleId: integer("matched_rule_id").references(() => inboxCategoryRules.id, { onDelete: "set null" }),
  aiConfidence: integer("ai_confidence"),
  aiReason: text("ai_reason"),
  classifiedAt: timestamp("classified_at"),
  /** Sticky gate — repo UPDATEs guard on this so re-classify can never clobber a manual pick. */
  manualOverride: boolean("manual_override").notNull().default(false),

  // ---- job pipeline (only populated when the category has trackSubStatus) ----
  jobStatus: jobApplicationStatus("job_status"),
  jobStatusSource: inboxAssignmentSource("job_status_source"),
  jobCompany: text("job_company"),
  jobRole: text("job_role"),

  // ---- identity / dedupe ----
  mailbox: text("mailbox").notNull().default("INBOX"),
  /** text, not integer: UIDVALIDITY is a 32-bit unsigned — keep it lossless. */
  uidValidity: text("uid_validity").notNull(),
  uid: integer("uid").notNull(),
  /** Nullable and deliberately NOT uniquely indexed — real mail omits it and bulk senders reuse it. */
  messageId: text("message_id"),
  gmailThreadId: text("gmail_thread_id"),

  // ---- envelope / content ----
  fromName: text("from_name"),
  fromAddress: text("from_address").notNull(),
  fromDomain: text("from_domain").notNull(),
  toAddress: text("to_address"),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  sizeBytes: integer("size_bytes"),
  /** IMAP INTERNALDATE. */
  receivedAt: timestamp("received_at").notNull(),
  isUnread: boolean("is_unread").notNull().default(false),

  // ---- lifecycle (two-phase trash) ----
  state: inboxMessageState("state").notNull().default("ACTIVE"),
  deleteRequestedAt: timestamp("delete_requested_at"),
  deletedAt: timestamp("deleted_at"),
  deleteError: text("delete_error"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUid: uniqueIndex("inbox_messages_user_mailbox_uid_unique")
    .on(t.userId, t.mailbox, t.uidValidity, t.uid),
  byUserStateReceived: index("inbox_messages_user_state_received_idx")
    .on(t.userId, t.state, t.receivedAt),
  byUserCategory: index("inbox_messages_user_category_idx").on(t.userId, t.categoryId),
}));

export const inboxSyncState = pgTable("inbox_sync_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  mailbox: text("mailbox").notNull().default("INBOX"),
  uidValidity: text("uid_validity"),
  lastSeenUid: integer("last_seen_uid").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: inboxSyncStatus("last_sync_status").notNull().default("IDLE"),
  lastSyncError: text("last_sync_error"),
  lastSyncErrorCode: text("last_sync_error_code"),
  messagesFetchedLast: integer("messages_fetched_last").notNull().default(0),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  /** Backoff gate, queried in SQL so a broken account is skipped without opening a socket. */
  nextAttemptAt: timestamp("next_attempt_at"),
  initialSyncDoneAt: timestamp("initial_sync_done_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
