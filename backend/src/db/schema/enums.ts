import { pgEnum } from "drizzle-orm/pg-core";
export const contactStatus = pgEnum("contact_status", ["PENDING","PROCESSING","SENT","FAILED","BOUNCED","PAUSED"]);
export const logStatus = pgEnum("log_status", ["GENERATED","SENT","FAILED","BOUNCED","RETRY_SCHEDULED","SKIPPED"]);
export const failureType = pgEnum("failure_type", ["TEMPORARY","PERMANENT"]);
export const campaignMode = pgEnum("campaign_mode", ["DRAFT","TEST","LIVE"]);
export const campaignState = pgEnum("campaign_state", ["IDLE","RUNNING","PAUSED","STOPPED"]);
export const queueStatus = pgEnum("queue_status", ["SCHEDULED","PROCESSING","DONE","CANCELLED"]);
