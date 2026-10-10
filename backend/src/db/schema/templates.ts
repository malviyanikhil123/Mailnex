import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { documents } from "./documents.js";

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // 'text' (plain text, formatted into HTML when sent) | 'html' (a sanitized HTML design).
  format: text("format").notNull().default("text"),
  category: text("category").notNull().default("general"),
  version: integer("version").notNull().default(1),
  // Legacy "selected for sending" flag. Campaigns pick their own templates now, so
  // nothing reads it any more; kept so no data is dropped.
  active: boolean("active").notNull().default(false),
  // Document attached to every email sent with this template (column keeps its old name).
  documentId: integer("resume_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqNameCategoryUser: uniqueIndex("email_templates_name_category_user_unique").on(t.name, t.category, t.userId),
}));
