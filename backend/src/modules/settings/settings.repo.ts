import { db } from "../../db/index.js";
import { appSettings, profileFields } from "../../db/schema/settings.js";
import { asc, eq } from "drizzle-orm";

export type AppSettings = typeof appSettings.$inferSelect;
export type ProfileField = typeof profileFields.$inferSelect;

/** Repository for per-user app_settings and profile_fields tables. */
export interface ISettingsRepo {
  getApp(userId: number): Promise<AppSettings | null>;
  patchApp(userId: number, patch: Partial<AppSettings>): Promise<AppSettings>;
  listProfileFields(userId: number): Promise<ProfileField[]>;
  replaceProfileFields(userId: number, fields: { key: string; label: string; value: string }[]): Promise<ProfileField[]>;
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
}

export const settingsRepo = new SettingsRepo();
