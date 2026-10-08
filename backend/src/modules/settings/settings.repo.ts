import { db } from "../../db/index.js";
import { appSettings, profileFields } from "../../db/schema/settings.js";
import { resumes } from "../../db/schema/resumes.js";
import { and, asc, desc, eq } from "drizzle-orm";

export type AppSettings = typeof appSettings.$inferSelect;
export type ProfileField = typeof profileFields.$inferSelect;
export type Resume = typeof resumes.$inferSelect;

/** Repository for per-user app_settings, profile_fields, and resumes tables. */
export interface ISettingsRepo {
  getApp(userId: number): Promise<AppSettings | null>;
  patchApp(userId: number, patch: Partial<AppSettings>): Promise<AppSettings>;
  listProfileFields(userId: number): Promise<ProfileField[]>;
  replaceProfileFields(userId: number, fields: { key: string; label: string; value: string }[]): Promise<ProfileField[]>;
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

  async listProfileFields(userId: number): Promise<ProfileField[]> {
    return db
      .select()
      .from(profileFields)
      .where(eq(profileFields.userId, userId))
      .orderBy(asc(profileFields.sortOrder), asc(profileFields.id));
  }

  async replaceProfileFields(
    userId: number,
    fields: { key: string; label: string; value: string }[],
  ): Promise<ProfileField[]> {
    return db.transaction(async (tx) => {
      await tx.delete(profileFields).where(eq(profileFields.userId, userId));
      if (fields.length === 0) return [];
      return tx
        .insert(profileFields)
        .values(fields.map((f, i) => ({ ...f, userId, sortOrder: i })))
        .returning();
    });
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
