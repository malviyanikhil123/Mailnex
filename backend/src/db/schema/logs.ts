import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts.js";
import { emailTemplates } from "./templates.js";
import { logStatus, failureType, campaignMode } from "./enums.js";
export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contacts.id),
  templateId: integer("template_id").references(() => emailTemplates.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  status: logStatus("status").notNull(),
  failureType: failureType("failure_type"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  aiUsed: boolean("ai_used").notNull().default(false),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
