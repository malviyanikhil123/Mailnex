import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { contactStatus } from "./enums.js";
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  location: text("location"),
  email: text("email").notNull(),
  contactPerson: text("contact_person"),
  status: contactStatus("status").notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqEmailUser: uniqueIndex("contacts_email_user_id_unique").on(t.email, t.userId),
}));
