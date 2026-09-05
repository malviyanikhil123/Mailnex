import { db } from "../../db/index.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { resumes } from "../../db/schema/resumes.js";
import { emailLogs } from "../../db/schema/logs.js";
import { and, eq, ne, sql, desc } from "drizzle-orm";
import type { CreateTemplateInput, UpdateTemplateInput } from "./templates.schema.js";

export type Template = typeof emailTemplates.$inferSelect;

export class TemplatesRepo {
  async create(userId: number, input: CreateTemplateInput): Promise<Template> {
    const [row] = await db
      .insert(emailTemplates)
      .values({ ...input, userId })
      .returning();
    return row;
  }

  async update(userId: number, id: number, data: Partial<UpdateTemplateInput> & { version?: number }): Promise<Template | null> {
    const [row] = await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, userId)))
      .returning();
    return row ?? null;
  }

  async remove(userId: number, id: number): Promise<{ id: number } | null> {
    const [row] = await db
      .delete(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, userId)))
      .returning({ id: emailTemplates.id });
    return row ?? null;
  }

  async list(userId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: emailTemplates.id,
        userId: emailTemplates.userId,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        body: emailTemplates.body,
        category: emailTemplates.category,
        version: emailTemplates.version,
        active: emailTemplates.active,
        resumeId: emailTemplates.resumeId,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
        resume: {
          id: resumes.id,
          name: resumes.name,
          fileName: resumes.fileName,
        },
      })
      .from(emailTemplates)
      .leftJoin(resumes, eq(emailTemplates.resumeId, resumes.id))
      .where(eq(emailTemplates.userId, userId))
      .orderBy(desc(emailTemplates.id));

    return rows.map((r) => ({
      ...r,
      resume: r.resume?.id ? r.resume : null,
    }));
  }

  async getById(userId: number, id: number): Promise<any | null> {
    const [row] = await db
      .select({
        id: emailTemplates.id,
        userId: emailTemplates.userId,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        body: emailTemplates.body,
        category: emailTemplates.category,
        version: emailTemplates.version,
        active: emailTemplates.active,
        resumeId: emailTemplates.resumeId,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
        resume: {
          id: resumes.id,
          name: resumes.name,
          fileName: resumes.fileName,
        },
      })
      .from(emailTemplates)
      .leftJoin(resumes, eq(emailTemplates.resumeId, resumes.id))
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, userId)));

    if (!row) return null;
    return {
      ...row,
      resume: row.resume?.id ? row.resume : null,
    };
  }

  async pickRandomActive(userId: number, options?: { isFollowup?: boolean }): Promise<Template | undefined> {
    const conditions = [eq(emailTemplates.active, true), eq(emailTemplates.userId, userId)];

    if (options?.isFollowup === true) {
      conditions.push(eq(emailTemplates.category, "followup"));
    } else {
      // First-time contacts: NEVER pick followup templates
      conditions.push(ne(emailTemplates.category, "followup"));
    }

    // Balanced round-robin: pick active template with fewest sent emails (tie-break by template id)
    const rows = await db
      .select({
        template: emailTemplates,
        useCount: sql<number>`count(${emailLogs.id})::int`,
      })
      .from(emailTemplates)
      .leftJoin(emailLogs, and(eq(emailLogs.templateId, emailTemplates.id), eq(emailLogs.userId, userId)))
      .where(and(...conditions))
      .groupBy(emailTemplates.id)
      .orderBy(sql`count(${emailLogs.id}) ASC`, asc(emailTemplates.id))
      .limit(1);

    if (rows.length > 0) return rows[0].template;

    // Fallback to any active template for this user (balanced by usage)
    const fallbackRows = await db
      .select({
        template: emailTemplates,
        useCount: sql<number>`count(${emailLogs.id})::int`,
      })
      .from(emailTemplates)
      .leftJoin(emailLogs, and(eq(emailLogs.templateId, emailTemplates.id), eq(emailLogs.userId, userId)))
      .where(and(eq(emailTemplates.active, true), eq(emailTemplates.userId, userId)))
      .groupBy(emailTemplates.id)
      .orderBy(sql`count(${emailLogs.id}) ASC`, asc(emailTemplates.id))
      .limit(1);

    return fallbackRows[0]?.template;
  }
}

export const templatesRepo = new TemplatesRepo();
