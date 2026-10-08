import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
// Per-user app settings; secret fields hold AES-GCM ciphertext. candidateProfile is JSON text.
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  emailProvider: text("email_provider").notNull().default("gmail"),
  gmailEmail: text("gmail_email"),
  gmailAppPasswordEnc: text("gmail_app_password_enc"),
  geminiApiKeyEnc: text("gemini_api_key_enc"),
  candidateProfile: text("candidate_profile").notNull().default("{}"),
  resumePath: text("resume_path"),
  // Daily cap for the primary Gmail, shared by every campaign that sends from it.
  senderDailyLimit: integer("sender_daily_limit").notNull().default(100),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User-defined "My Profile" fields. Each value is available in templates as {{key}}
// alongside the built-in profile fields.
export const profileFields = pgTable("profile_fields", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  value: text("value").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqKeyUser: uniqueIndex("profile_fields_key_user_unique").on(t.key, t.userId),
}));
