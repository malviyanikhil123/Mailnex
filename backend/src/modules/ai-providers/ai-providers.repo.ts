import { db } from "../../db/index.js";
import { aiProviderKeys } from "../../db/schema/ai.js";
import { campaigns } from "../../db/schema/campaign.js";
import { and, asc, eq, ne } from "drizzle-orm";

export type AiProviderKey = typeof aiProviderKeys.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Repository for per-user ai_provider_keys rows (one per provider). */
export interface IAiProvidersRepo {
  /** Oldest first, so "the first key the user added" is rows[0]. */
  list(userId: number): Promise<AiProviderKey[]>;
  get(userId: number, provider: string): Promise<AiProviderKey | null>;
  /** Inserts the provider's row or replaces its key and model. In the same transaction it
   *  becomes the default when `makeDefault` is set or the user has no default yet. */
  upsert(
    userId: number,
    provider: string,
    values: { apiKeyEnc: string; defaultModel: string },
    options?: { makeDefault?: boolean },
  ): Promise<AiProviderKey>;
  updateModel(userId: number, provider: string, defaultModel: string): Promise<void>;
  /** Makes `provider` the user's only default. */
  setDefault(userId: number, provider: string): Promise<void>;
  /** Deletes the key and points campaigns that used it back at the default provider; if it
   *  was the default, the oldest remaining key takes over (all in one transaction). */
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
    options: { makeDefault?: boolean } = {},
  ): Promise<AiProviderKey> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(aiProviderKeys)
        .values({ ...values, userId, provider })
        .onConflictDoUpdate({
          target: [aiProviderKeys.userId, aiProviderKeys.provider],
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      if (options.makeDefault || !(await hasDefault(tx, userId))) {
        await setDefaultIn(tx, userId, provider);
        row.isDefault = true;
      }
      return row;
    });
  }

  async updateModel(userId: number, provider: string, defaultModel: string): Promise<void> {
    await db
      .update(aiProviderKeys)
      .set({ defaultModel, updatedAt: new Date() })
      .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)));
  }

  async setDefault(userId: number, provider: string): Promise<void> {
    await db.transaction((tx) => setDefaultIn(tx, userId, provider));
  }

  async remove(userId: number, provider: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(aiProviderKeys)
        .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.provider, provider)))
        .returning({ id: aiProviderKeys.id, isDefault: aiProviderKeys.isDefault });
      if (!deleted) return false;
      await tx
        .update(campaigns)
        .set({ aiProvider: null, aiModel: null, updatedAt: new Date() })
        .where(and(eq(campaigns.userId, userId), eq(campaigns.aiProvider, provider)));
      if (deleted.isDefault) {
        const [next] = await tx
          .select({ provider: aiProviderKeys.provider })
          .from(aiProviderKeys)
          .where(eq(aiProviderKeys.userId, userId))
          .orderBy(asc(aiProviderKeys.createdAt), asc(aiProviderKeys.id))
          .limit(1);
        if (next) await setDefaultIn(tx, userId, next.provider);
      }
      return true;
    });
  }
}

async function hasDefault(tx: Tx, userId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: aiProviderKeys.id })
    .from(aiProviderKeys)
    .where(and(eq(aiProviderKeys.userId, userId), eq(aiProviderKeys.isDefault, true)))
    .limit(1);
  return !!row;
}

/** Makes `provider` the user's only default, inside the caller's transaction. */
async function setDefaultIn(tx: Tx, userId: number, provider: string): Promise<void> {
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
}

export const aiProvidersRepo = new AiProvidersRepo();
