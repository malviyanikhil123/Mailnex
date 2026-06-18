import { pgTable, serial, integer, date } from "drizzle-orm/pg-core";
export const dailyQuota = pgTable("daily_quota", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  emailsSent: integer("emails_sent").notNull().default(0),
});
