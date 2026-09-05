import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema/settings.js";
import { campaignSettings } from "../../db/schema/campaign.js";
import { resumes } from "../../db/schema/resumes.js";
import { and, desc, eq } from "drizzle-orm";

export type AppSettings = typeof appSettings.$inferSelect;
export type CampaignSettings = typeof campaignSettings.$inferSelect;
export type Resume = typeof resumes.$inferSelect;

/** Repository for per-user app_settings, campaign_settings, and resumes tables. */
export interface ISettingsRepo {
  getApp(userId: number): Promise<AppSettings | null>;
  patchApp(userId: number, patch: Partial<AppSettings>): Promise<AppSettings>;
  getCampaign(userId: number): Promise<CampaignSettings | null>;
  patchCampaign(userId: number, patch: Partial<CampaignSettings>): Promise<CampaignSettings>;
  listResumes(userId: number): Promise<Resume[]>;
  getResume(userId: number, resumeId: number): Promise<Resume | null>;
  addResume(userId: number, name: string, fileName: string, filePath: string): Promise<Resume>;
  deleteResume(userId: number, resumeId: number): Promise<Resume | null>;
}

export class SettingsRepo implements ISettingsRepo {
  async getApp(userId: number): Promise<AppSettings | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.userId, userId)).limit(1);
    return row ?? null;
  }

  async patchApp(userId: number, patch: Partial<AppSettings>): Promise<AppSettings> {
    const existing = await this.getApp(userId);
    if (!existing) {
      const [row] = await db
        .insert(appSettings)
        .values({ ...patch, userId, updatedAt: new Date() })
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

  async getCampaign(userId: number): Promise<CampaignSettings | null> {
    const [row] = await db.select().from(campaignSettings).where(eq(campaignSettings.userId, userId)).limit(1);
    return row ?? null;
  }

  async patchCampaign(userId: number, patch: Partial<CampaignSettings>): Promise<CampaignSettings> {
    const existing = await this.getCampaign(userId);
    if (!existing) {
      const [row] = await db
        .insert(campaignSettings)
        .values({ ...patch, userId, updatedAt: new Date() })
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

  async listResumes(userId: number): Promise<Resume[]> {
    return db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt));
  }

  async getResume(userId: number, resumeId: number): Promise<Resume | null> {
    const [row] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async addResume(userId: number, name: string, fileName: string, filePath: string): Promise<Resume> {
    const [row] = await db
      .insert(resumes)
      .values({ userId, name, fileName, filePath })
      .returning();
    return row;
  }

  async deleteResume(userId: number, resumeId: number): Promise<Resume | null> {
    const [row] = await db
      .delete(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning();
    return row ?? null;
  }
}

export const settingsRepo = new SettingsRepo();
