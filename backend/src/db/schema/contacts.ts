import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { contactStatus } from "./enums.js";
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  location: text("location"),
  email: text("email").notNull().unique(),
  contactPerson: text("contact_person"),
  status: contactStatus("status").notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
