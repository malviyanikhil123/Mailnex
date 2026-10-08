import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Additional Gmail accounts a user can send campaigns from. The app password is
// AES-GCM ciphertext (utils/crypto) and is never returned by the API.
export const senderAccounts = pgTable("sender_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  email: text("email").notNull(),
  appPasswordEnc: text("app_password_enc").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(50),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqEmailUser: uniqueIndex("sender_accounts_email_user_unique").on(t.email, t.userId),
}));
