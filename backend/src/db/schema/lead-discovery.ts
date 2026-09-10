import { pgTable, serial, text, integer, timestamp, boolean, real, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { contacts } from "./contacts.js";

export const discoveryJobs = pgTable(
  "discovery_jobs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    location: text("location"),
    profession: text("profession"),
    keywords: text("keywords"),
    companyType: text("company_type"),
    targetCount: integer("target_count").notNull().default(50),
    status: text("status").notNull().default("QUEUED"),
    companiesFound: integer("companies_found").notNull().default(0),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    emailsFound: integer("emails_found").notNull().default(0),
    hrEmailsFound: integer("hr_emails_found").notNull().default(0),
    duplicatesRemoved: integer("duplicates_removed").notNull().default(0),
    currentDomain: text("current_domain"),
    progress: integer("progress").notNull().default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("discovery_jobs_user_id_idx").on(t.userId),
    statusIdx: index("discovery_jobs_status_idx").on(t.status),
    createdAtIdx: index("discovery_jobs_created_at_idx").on(t.createdAt),
  })
);

export const discoveredLeads = pgTable(
  "discovered_leads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id").references(() => discoveryJobs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    name: text("name"),
    companyName: text("company_name"),
    companyDomain: text("company_domain"),
    companyType: text("company_type"),
    industry: text("industry"),
    location: text("location"),
    emailCategory: text("email_category").notNull().default("General"),
    classificationConfidence: real("classification_confidence").notNull().default(0.5),
    sourceUrl: text("source_url"),
    isValid: boolean("is_valid").notNull().default(true),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    isImported: boolean("is_imported").notNull().default(false),
    importedContactId: integer("imported_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userNormalizedEmailIdx: index("discovered_leads_user_normalized_email_idx").on(t.userId, t.normalizedEmail),
    jobIdIdx: index("discovered_leads_job_id_idx").on(t.jobId),
    userCategoryIdx: index("discovered_leads_user_category_idx").on(t.userId, t.emailCategory),
    createdAtIdx: index("discovered_leads_created_at_idx").on(t.createdAt),
  })
);
