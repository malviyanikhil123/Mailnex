import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts.js";
import { campaignMode, campaignState, queueStatus } from "./enums.js";
export const campaignSettings = pgTable("campaign_settings", {
  id: serial("id").primaryKey(),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  state: campaignState("state").notNull().default("IDLE"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(18),
  testEmail: text("test_email"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const campaignQueue = pgTable("campaign_queue", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: queueStatus("status").notNull().default("SCHEDULED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
