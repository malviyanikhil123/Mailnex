import { db } from "../../db/index.js";
import { documents } from "../../db/schema/documents.js";
import { and, count, desc, eq, sql } from "drizzle-orm";

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocument = Pick<DocumentRow, "name" | "fileName" | "filePath">;

/** Repository for the per-user documents table. */
export interface IDocumentsRepo {
  list(userId: number): Promise<DocumentRow[]>;
  count(userId: number): Promise<number>;
  get(userId: number, id: number): Promise<DocumentRow | null>;
  /** Inserts unless the user already has `max` documents; returns null when full. */
  addWithinLimit(userId: number, doc: NewDocument, max: number): Promise<DocumentRow | null>;
  remove(userId: number, id: number): Promise<DocumentRow | null>;
}

export class DocumentsRepo implements IDocumentsRepo {
  async list(userId: number): Promise<DocumentRow[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt), desc(documents.id));
  }

  async count(userId: number): Promise<number> {
    const [row] = await db.select({ n: count() }).from(documents).where(eq(documents.userId, userId));
    return row?.n ?? 0;
  }

  async get(userId: number, id: number): Promise<DocumentRow | null> {
    const [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async addWithinLimit(userId: number, doc: NewDocument, max: number): Promise<DocumentRow | null> {
    return db.transaction(async (tx) => {
      // Serialises concurrent uploads of one user so two requests can't both pass the count.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('documents'), ${userId}::int)`);
      const [{ n }] = await tx.select({ n: count() }).from(documents).where(eq(documents.userId, userId));
      if (n >= max) return null;
      const [row] = await tx.insert(documents).values({ ...doc, userId }).returning();
      return row;
    });
  }

  async remove(userId: number, id: number): Promise<DocumentRow | null> {
    const [row] = await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return row ?? null;
  }
}

export const documentsRepo = new DocumentsRepo();
