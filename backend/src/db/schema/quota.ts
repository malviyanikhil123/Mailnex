import { pgTable, serial, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const dailyQuota = pgTable("daily_quota", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  emailsSent: integer("emails_sent").notNull().default(0),
}, (t) => ({
  uniqDateUser: uniqueIndex("daily_quota_date_user_id_unique").on(t.date, t.userId),
}));
