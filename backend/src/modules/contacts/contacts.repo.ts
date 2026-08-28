import { db } from "../../db/index.js";
import { contacts } from "../../db/schema/contacts.js";
import { contactsImports } from "../../db/schema/imports.js";
import { campaignQueue } from "../../db/schema/campaign.js";
import { emailLogs } from "../../db/schema/logs.js";
import { ilike, eq, or, and, count } from "drizzle-orm";
import type { ListContactsQuery } from "./contacts.schema.js";
import type { contactStatus } from "../../db/schema/enums.js";

type ContactStatusValue = typeof contactStatus.enumValues[number];

export type ContactInsertRow = {
  companyName: string;
  location: string;
  email: string;
};

export type ImportSummary = {
  fileName: string;
  total: number;
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
};

export class ContactsRepo {
  async bulkInsert(userId: number, rows: ContactInsertRow[]): Promise<{ inserted: number }> {
    if (rows.length === 0) return { inserted: 0 };

    const CHUNK_SIZE = 1000;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await db
        .insert(contacts)
        .values(chunk.map((r) => ({ ...r, userId })))
        .onConflictDoNothing()
        .returning({ id: contacts.id });
      inserted += result.length;
    }

    return { inserted };
  }

  async list(userId: number, query: ListContactsQuery) {
    const { search, status, page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(contacts.userId, userId)];
    if (search) {
      conditions.push(
        or(
          ilike(contacts.companyName, `%${search}%`),
          ilike(contacts.email, `%${search}%`),
        )!,
      );
    }
    if (status) {
      conditions.push(eq(contacts.status, status as ContactStatusValue));
    }

    const where = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      db.select().from(contacts).where(where).limit(limit).offset(offset),
      db.select({ total: count() }).from(contacts).where(where),
    ]);

    return { rows, total: Number(totalResult[0]?.total ?? 0) };
  }

  async getById(userId: number, id: number) {
    const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
    return row ?? null;
  }

  async delete(userId: number, id: number) {
    return db.transaction(async (tx) => {
      // 1. Remove pending queue entries for this contact
      await tx.delete(campaignQueue).where(eq(campaignQueue.contactId, id));
      // 2. Remove email logs associated with this contact
      await tx.delete(emailLogs).where(eq(emailLogs.contactId, id));
      // 3. Delete the contact (scoped to user)
      const [row] = await tx
        .delete(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
        .returning({ id: contacts.id });
      return row ?? null;
    });
  }

  async recordImport(userId: number, summary: ImportSummary) {
    const [row] = await db
      .insert(contactsImports)
      .values({
        userId,
        fileName: summary.fileName,
        totalRows: summary.total,
        importedRows: summary.imported,
        skippedRows: summary.skipped,
        duplicateRows: summary.duplicate,
        invalidRows: summary.invalid,
      })
      .returning();
    return row;
  }

  async listImports(userId: number) {
    return db
      .select()
      .from(contactsImports)
      .where(eq(contactsImports.userId, userId))
      .orderBy(contactsImports.createdAt);
  }
}

export const contactsRepo = new ContactsRepo();
