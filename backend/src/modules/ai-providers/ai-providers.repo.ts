import { db } from "../../db/index.js";
import { aiProviderKeys } from "../../db/schema/ai.js";
import { campaigns } from "../../db/schema/campaign.js";
import { and, asc, eq, ne } from "drizzle-orm";

export type AiProviderKey = typeof aiProviderKeys.$inferSelect;

/** Repository for per-user ai_provider_keys rows (one per provider). */
export interface IAiProvidersRepo {
  /** Oldest first, so "the first key the user added" is rows[0]. */
  list(userId: number): Promise<AiProviderKey[]>;
  get(userId: number, provider: string): Promise<AiProviderKey | null>;
  /** Inserts the provider's row or replaces its key and model. */
  upsert(userId: number, provider: string, values: { apiKeyEnc: string; defaultModel: string }): Promise<AiProviderKey>;
  updateModel(userId: number, provider: string, defaultModel: string): Promise<void>;
  /** Makes `provider` the user's only default. */
  setDefault(userId: number, provider: string): Promise<void>;
  /** Deletes the key and points campaigns that used it back at the default provider. */
  remove(userId: number, provider: string): Promise<boolean>;
}

export class AiProvidersRepo implements IAiProvidersRepo {
  async list(userId: number): Promise<AiProviderKey[]> {
    return db
      .select()
      .from(aiProviderKeys)
      .where(eq(aiProviderKeys.userId, userId))
      .orderBy(asc(aiProviderKeys.createdAt), asc(aiProviderKeys.id));
  }

  async get(userId: number, provider: string): Promise<AiProviderKey | null> {
    const [row] = await db
      .select()
      .from(aiProviderKeys)
      .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)))
      .limit(1);
    return row ?? null;
  }

  async upsert(
    userId: number,
    provider: string,
    values: { apiKeyEnc: string; defaultModel: string },
  ): Promise<AiProviderKey> {
    const [row] = await db
      .insert(aiProviderKeys)
      .values({ ...values, userId, provider })
      .onConflictDoUpdate({
        target: [aiProviderKeys.userId, aiProviderKeys.provider],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async updateModel(userId: number, provider: string, defaultModel: string): Promise<void> {
    await db
      .update(aiProviderKeys)
      .set({ defaultModel, updatedAt: new Date() })
      .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)));
  }

  async setDefault(userId: number, provider: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(aiProviderKeys)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(aiProviderKeys.userId, userId),
          ne(aiProviderKeys.provider, provider),
          eq(aiProviderKeys.isDefault, true),
        ));
      await tx
        .update(aiProviderKeys)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)));
    });
  }

  async remove(userId: number, provider: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const rows = await tx
        .delete(aiProviderKeys)
        .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)))
        .returning({ id: aiProviderKeys.id });
      if (rows.length === 0) return false;
      await tx
        .update(campaigns)
        .set({ aiProvider: null, aiModel: null, updatedAt: new Date() })
        .where(and(eq(campaigns.userId, userId), eq(campaigns.aiProvider, provider)));
      return true;
    });
  }
}

export const aiProvidersRepo = new AiProvidersRepo();
