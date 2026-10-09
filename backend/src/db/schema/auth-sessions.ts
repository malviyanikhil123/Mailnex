import { pgTable, uuid, integer, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One row per signed-in browser/device. The refresh JWT carries the row id as `sid`;
// token_hash is the SHA-256 hex of the current refresh token (rotated on every refresh).
export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  rememberMe: boolean("remember_me").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  userAgent: text("user_agent"),
}, (t) => ({
  tokenHashUnique: uniqueIndex("auth_sessions_token_hash_unique").on(t.tokenHash),
  userIdx: index("auth_sessions_user_id_idx").on(t.userId),
  expiresIdx: index("auth_sessions_expires_at_idx").on(t.expiresAt),
}));
