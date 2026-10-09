import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One API key per AI provider (openai | anthropic | google | groq) per user. The key
// is AES-GCM ciphertext (utils/crypto) and is never returned by the API. At most one
// row per user has is_default = true (enforced by the ai-providers service); that
// provider serves inbox classification and campaigns that do not pick their own.
export const aiProviderKeys = pgTable("ai_provider_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),
  defaultModel: text("default_model").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserProvider: uniqueIndex("ai_provider_keys_user_provider_unique").on(t.userId, t.provider),
}));
