import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema/settings.js";
import { campaignSettings } from "../../db/schema/campaign.js";
import { eq } from "drizzle-orm";

export type AppSettings = typeof appSettings.$inferSelect;
export type CampaignSettings = typeof campaignSettings.$inferSelect;

/** Repository for the single-row app_settings and campaign_settings tables.
 *  Both tables are seeded with one row; patch methods update that row (and
 *  fall back to inserting one if the table is empty). */
export interface ISettingsRepo {
  getApp(): Promise<AppSettings | null>;
  patchApp(patch: Partial<AppSettings>): Promise<AppSettings>;
  getCampaign(): Promise<CampaignSettings | null>;
  patchCampaign(patch: Partial<CampaignSettings>): Promise<CampaignSettings>;
}

export class SettingsRepo implements ISettingsRepo {
  async getApp(): Promise<AppSettings | null> {
    const [row] = await db.select().from(appSettings).limit(1);
    return row ?? null;
  }

  async patchApp(patch: Partial<AppSettings>): Promise<AppSettings> {
    const existing = await this.getApp();
    if (!existing) {
      const [row] = await db
        .insert(appSettings)
        .values({ ...patch, updatedAt: new Date() })
        .returning();
      return row;
    }
    const [row] = await db
      .update(appSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id))
      .returning();
    return row;
  }

  async getCampaign(): Promise<CampaignSettings | null> {
    const [row] = await db.select().from(campaignSettings).limit(1);
    return row ?? null;
  }

  async patchCampaign(patch: Partial<CampaignSettings>): Promise<CampaignSettings> {
    const existing = await this.getCampaign();
    if (!existing) {
      const [row] = await db
        .insert(campaignSettings)
        .values({ ...patch, updatedAt: new Date() })
        .returning();
      return row;
    }
    const [row] = await db
      .update(campaignSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(campaignSettings.id, existing.id))
      .returning();
    return row;
  }
}

export const settingsRepo = new SettingsRepo();
