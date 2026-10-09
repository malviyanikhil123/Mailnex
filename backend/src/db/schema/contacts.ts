import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { contactStatus } from "./enums.js";
import { contactsImports } from "./imports.js";
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Only the email is required; every other field is whatever the spreadsheet had.
  companyName: text("company_name"),
  location: text("location"),
  email: text("email").notNull(),
  // Legacy single-name column (older imports, lead discovery). New imports fill first/last name.
  contactPerson: text("contact_person"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  website: text("website"),
  // Extra spreadsheet columns keyed by normalized header (e.g. "industry"), usable as {{industry}}.
  customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
  importId: integer("import_id").references(() => contactsImports.id, { onDelete: "set null" }),
  status: contactStatus("status").notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  // Emails stay unique per user, so an email lives in exactly one import. To let the
  // same email sit in several imports, switch this to (email, import_id) and move
  // send status off contacts onto a per-campaign table.
  uniqEmailUser: uniqueIndex("contacts_email_user_id_unique").on(t.email, t.userId),
  importIdx: index("contacts_import_id_idx").on(t.importId),
}));
