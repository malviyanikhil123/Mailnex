import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
// Single-row app settings; secret fields hold AES-GCM ciphertext. candidateProfile is JSON text.
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  emailProvider: text("email_provider").notNull().default("gmail"),
  gmailEmail: text("gmail_email"),
  gmailAppPasswordEnc: text("gmail_app_password_enc"),
  geminiApiKeyEnc: text("gemini_api_key_enc"),
  candidateProfile: text("candidate_profile").notNull().default("{}"),
  resumePath: text("resume_path"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
