import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumes } from "./resumes.js";

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("general"),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(false),
  resumeId: integer("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqNameCategoryUser: uniqueIndex("email_templates_name_category_user_unique").on(t.name, t.category, t.userId),
}));
