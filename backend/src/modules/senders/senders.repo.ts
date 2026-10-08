import { db } from "../../db/index.js";
import { senderAccounts } from "../../db/schema/senders.js";
import { and, asc, eq } from "drizzle-orm";

export type SenderAccount = typeof senderAccounts.$inferSelect;

export class SendersRepo {
  async list(userId: number): Promise<SenderAccount[]> {
    return db
      .select()
      .from(senderAccounts)
      .where(eq(senderAccounts.userId, userId))
      .orderBy(asc(senderAccounts.id));
  }

  async get(userId: number, id: number): Promise<SenderAccount | null> {
    const [row] = await db
      .select()
      .from(senderAccounts)
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async create(
    userId: number,
    values: { label: string; email: string; appPasswordEnc: string; dailyLimit: number },
  ): Promise<SenderAccount> {
    const [row] = await db.insert(senderAccounts).values({ ...values, userId }).returning();
    return row;
  }

  async update(userId: number, id: number, patch: Partial<SenderAccount>): Promise<SenderAccount | null> {
    const [row] = await db
      .update(senderAccounts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.userId, userId)))
      .returning();
    return row ?? null;
  }

  async remove(userId: number, id: number): Promise<boolean> {
    const rows = await db
      .delete(senderAccounts)
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.userId, userId)))
      .returning({ id: senderAccounts.id });
    return rows.length > 0;
  }
}

export const sendersRepo = new SendersRepo();
