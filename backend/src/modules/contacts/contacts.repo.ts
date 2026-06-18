import { db } from "../../db/index.js";
import { contacts } from "../../db/schema/contacts.js";
import { contactsImports } from "../../db/schema/imports.js";
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
  /**
   * Bulk-insert contacts in chunks of 1000, ignoring email conflicts.
   *
   * Uses .returning({ id: contacts.id }) per chunk to count actual inserts.
   * Rows that conflict on email are silently dropped by onConflictDoNothing,
   * so the returned array is shorter than the chunk — the difference equals
   * DB-level duplicates.
   *
   * Counting semantics:
   *   inserted = sum of returned rows across all chunks
   *   duplicateRows (in ImportSummary) = withinFileDups + (validUniqueRows - inserted)
   */
  async bulkInsert(rows: ContactInsertRow[]): Promise<{ inserted: number }> {
    if (rows.length === 0) return { inserted: 0 };

    const CHUNK_SIZE = 1000;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await db
        .insert(contacts)
        .values(chunk)
        .onConflictDoNothing({ target: contacts.email })
        .returning({ id: contacts.id });
      inserted += result.length;
    }

    return { inserted };
  }

  async list(query: ListContactsQuery) {
    const { search, status, page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(contacts.companyName, `%${search}%`),
          ilike(contacts.email, `%${search}%`),
        ),
      );
    }
    if (status) {
      conditions.push(eq(contacts.status, status as ContactStatusValue));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      db.select().from(contacts).where(where).limit(limit).offset(offset),
      db.select({ total: count() }).from(contacts).where(where),
    ]);

    return { rows, total: Number(totalResult[0]?.total ?? 0) };
  }

  async getById(id: number) {
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    return row ?? null;
  }

  async delete(id: number) {
    const [row] = await db
      .delete(contacts)
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    return row ?? null;
  }

  async recordImport(summary: ImportSummary) {
    const [row] = await db
      .insert(contactsImports)
      .values({
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

  async listImports() {
    return db
      .select()
      .from(contactsImports)
      .orderBy(contactsImports.createdAt);
  }
}

export const contactsRepo = new ContactsRepo();
