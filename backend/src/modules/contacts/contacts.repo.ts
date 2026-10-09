import { db } from "../../db/index.js";
import { contacts } from "../../db/schema/contacts.js";
import { contactsImports } from "../../db/schema/imports.js";
import { campaignQueue } from "../../db/schema/campaign.js";
import { emailLogs } from "../../db/schema/logs.js";
import { ilike, eq, or, and, asc, desc, count, sql } from "drizzle-orm";
import type { ListContactsQuery, ListImportsQuery } from "./contacts.schema.js";
import type { contactStatus } from "../../db/schema/enums.js";

type ContactStatusValue = typeof contactStatus.enumValues[number];

export type ContactInsertRow = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  customFields?: Record<string, string>;
};

export type ImportSummary = {
  name?: string | null;
  fileName: string;
  total: number;
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  customFieldKeys?: string[];
};

export class ContactsRepo {
  async bulkInsert(userId: number, rows: ContactInsertRow[], importId?: number): Promise<{ inserted: number }> {
    if (rows.length === 0) return { inserted: 0 };

    const CHUNK_SIZE = 1000;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await db
        .insert(contacts)
        .values(chunk.map((r) => ({ ...r, userId, importId })))
        .onConflictDoNothing()
        .returning({ id: contacts.id });
      inserted += result.length;
    }

    return { inserted };
  }

  async list(userId: number, query: ListContactsQuery) {
    const { search, status, importId, page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(contacts.userId, userId)];
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        or(
          ilike(contacts.companyName, like),
          ilike(contacts.email, like),
          ilike(contacts.contactPerson, like),
          // Matches the first name, the last name and "first last" alike.
          sql`concat_ws(' ', ${contacts.firstName}, ${contacts.lastName}) ilike ${like}`,
        )!,
      );
    }
    if (status) {
      conditions.push(eq(contacts.status, status as ContactStatusValue));
    }
    if (importId) {
      conditions.push(eq(contacts.importId, importId));
    }

    const where = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      db.select().from(contacts).where(where).orderBy(asc(contacts.id)).limit(limit).offset(offset),
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
        name: summary.name ?? null,
        fileName: summary.fileName,
        totalRows: summary.total,
        importedRows: summary.imported,
        skippedRows: summary.skipped,
        duplicateRows: summary.duplicate,
        invalidRows: summary.invalid,
        customFieldKeys: summary.customFieldKeys ?? [],
      })
      .returning();
    return row;
  }

  /** Fills in the final counts once the rows of an import are inserted. */
  async updateImportCounts(id: number, summary: Omit<ImportSummary, "fileName" | "name">) {
    await db
      .update(contactsImports)
      .set({
        totalRows: summary.total,
        importedRows: summary.imported,
        skippedRows: summary.skipped,
        duplicateRows: summary.duplicate,
        invalidRows: summary.invalid,
      })
      .where(eq(contactsImports.id, id));
  }

  async deleteImport(userId: number, id: number) {
    await db.delete(contactsImports).where(and(eq(contactsImports.id, id), eq(contactsImports.userId, userId)));
  }

  async getImport(userId: number, id: number) {
    const [row] = await db
      .select()
      .from(contactsImports)
      .where(and(eq(contactsImports.id, id), eq(contactsImports.userId, userId)));
    return row ?? null;
  }

  /**
   * Imports with how many of their contacts exist now and how many are still pending,
   * filtered by name / file name. Paginated only when page or limit is given.
   */
  async listImports(userId: number, query: Partial<ListImportsQuery> = {}) {
    const conditions = [eq(contactsImports.userId, userId)];
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(or(ilike(contactsImports.name, like), ilike(contactsImports.fileName, like))!);
    }
    const where = and(...conditions);
    const order =
      query.sort === "newest"
        ? [desc(contactsImports.createdAt), desc(contactsImports.id)]
        : [asc(contactsImports.createdAt), asc(contactsImports.id)];

    const rowsQuery = db
      .select({
        id: contactsImports.id,
        name: contactsImports.name,
        fileName: contactsImports.fileName,
        totalRows: contactsImports.totalRows,
        importedRows: contactsImports.importedRows,
        skippedRows: contactsImports.skippedRows,
        duplicateRows: contactsImports.duplicateRows,
        invalidRows: contactsImports.invalidRows,
        customFieldKeys: contactsImports.customFieldKeys,
        createdAt: contactsImports.createdAt,
        // Columns are spelled out with table names: drizzle renders them unqualified here,
        // and a bare "id" inside the subquery would resolve to contacts.id.
        contactCount: sql<number>`(select count(*)::int from "contacts" c where c."import_id" = "contacts_imports"."id")`,
        pendingCount: sql<number>`(select count(*)::int from "contacts" c where c."import_id" = "contacts_imports"."id" and c."status" = 'PENDING')`,
      })
      .from(contactsImports)
      .where(where)
      .orderBy(...order)
      .$dynamic();

    if (query.page === undefined && query.limit === undefined) {
      const imports = await rowsQuery;
      return { imports, total: imports.length };
    }
    const limit = query.limit ?? 20;
    const offset = ((query.page ?? 1) - 1) * limit;
    const [imports, totalResult] = await Promise.all([
      rowsQuery.limit(limit).offset(offset),
      db.select({ total: count() }).from(contactsImports).where(where),
    ]);
    return { imports, total: Number(totalResult[0]?.total ?? 0) };
  }
}

export const contactsRepo = new ContactsRepo();
