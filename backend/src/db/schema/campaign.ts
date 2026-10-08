import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { contacts } from "./contacts.js";
import { contactsImports } from "./imports.js";
import { emailTemplates } from "./templates.js";
import { senderAccounts } from "./senders.js";
import { campaignMode, campaignState, queueStatus } from "./enums.js";

// Legacy single-campaign-per-user settings. Superseded by `campaigns` (each row was
// backfilled into a "Default campaign" by migration 0003); kept so no data is dropped.
export const campaignSettings = pgTable("campaign_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  state: campaignState("state").notNull().default("IDLE"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(18),
  testEmail: text("test_email"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A user runs many campaigns side by side. Each campaign targets one contacts import,
// rotates through its own set of templates, and sends from one sender account
// (null = the primary Gmail configured in Settings).
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  importId: integer("import_id").references(() => contactsImports.id, { onDelete: "set null" }),
  senderAccountId: integer("sender_account_id").references(() => senderAccounts.id, { onDelete: "set null" }),
  mode: campaignMode("mode").notNull().default("DRAFT"),
  state: campaignState("state").notNull().default("IDLE"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(18),
  testEmail: text("test_email"),
  language: text("language").notNull().default("English"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  aiInstructions: text("ai_instructions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("campaigns_user_id_idx").on(t.userId),
  stateIdx: index("campaigns_state_idx").on(t.state),
}));

export const campaignTemplates = pgTable("campaign_templates", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => emailTemplates.id, { onDelete: "cascade" }),
}, (t) => ({
  uniqCampaignTemplate: uniqueIndex("campaign_templates_campaign_template_unique").on(t.campaignId, t.templateId),
}));

export const campaignQueue = pgTable("campaign_queue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: queueStatus("status").notNull().default("SCHEDULED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  campaignStatusIdx: index("campaign_queue_campaign_status_idx").on(t.campaignId, t.status),
}));
