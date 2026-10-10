import { db } from "../../db/index.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { documents } from "../../db/schema/documents.js";
import { emailLogs } from "../../db/schema/logs.js";
import { campaignTemplates } from "../../db/schema/campaign.js";
import { and, eq, ne, sql, desc, asc } from "drizzle-orm";
import type { CreateTemplateInput, UpdateTemplateInput } from "./templates.schema.js";

export type Template = typeof emailTemplates.$inferSelect;
export type NewTemplateRow = Pick<typeof emailTemplates.$inferInsert, "name" | "subject" | "body" | "category" | "format">;

export class TemplatesRepo {
  async create(userId: number, input: CreateTemplateInput): Promise<Template> {
    const [row] = await db
      .insert(emailTemplates)
      .values({ ...input, userId })
      .returning();
    return row;
  }

  /** Inserts the rows the user does not have yet; a (name, category) clash is skipped,
   *  never an error. Returns the rows actually inserted. */
  async createMany(userId: number, rows: NewTemplateRow[]): Promise<Template[]> {
    if (rows.length === 0) return [];
    return db
      .insert(emailTemplates)
      .values(rows.map((r) => ({ ...r, userId })))
      .onConflictDoNothing({ target: [emailTemplates.name, emailTemplates.category, emailTemplates.userId] })
      .returning();
  }

  /** (name, category) of every template of the user — the unique key per user. */
  async listKeys(userId: number): Promise<{ name: string; category: string }[]> {
    return db
      .select({ name: emailTemplates.name, category: emailTemplates.category })
      .from(emailTemplates)
      .where(eq(emailTemplates.userId, userId));
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
        format: emailTemplates.format,
        category: emailTemplates.category,
        version: emailTemplates.version,
        active: emailTemplates.active,
        documentId: emailTemplates.documentId,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
        document: {
          id: documents.id,
          name: documents.name,
          fileName: documents.fileName,
        },
      })
      .from(emailTemplates)
      .leftJoin(documents, and(eq(emailTemplates.documentId, documents.id), eq(documents.userId, emailTemplates.userId)))
      .where(eq(emailTemplates.userId, userId))
      .orderBy(desc(emailTemplates.id));

    return rows.map((r) => ({
      ...r,
      document: r.document?.id ? r.document : null,
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
        format: emailTemplates.format,
        category: emailTemplates.category,
        version: emailTemplates.version,
        active: emailTemplates.active,
        documentId: emailTemplates.documentId,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
        document: {
          id: documents.id,
          name: documents.name,
          fileName: documents.fileName,
        },
      })
      .from(emailTemplates)
      .leftJoin(documents, and(eq(emailTemplates.documentId, documents.id), eq(documents.userId, emailTemplates.userId)))
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, userId)));

    if (!row) return null;
    return {
      ...row,
      document: row.document?.id ? row.document : null,
    };
  }

  /** Rotates through the templates attached to a campaign, least-used in that campaign
   *  first. First-time contacts never get "followup" templates and already-contacted
   *  ones prefer them; if the preferred group is empty, any template of the campaign is used. */
  async pickForCampaign(
    userId: number,
    campaignId: number,
    options?: { isFollowup?: boolean },
  ): Promise<Template | undefined> {
    const pick = (categoryFilter?: ReturnType<typeof eq>) =>
      db
        .select({ template: emailTemplates })
        .from(campaignTemplates)
        .innerJoin(emailTemplates, eq(campaignTemplates.templateId, emailTemplates.id))
        .leftJoin(
          emailLogs,
          and(eq(emailLogs.templateId, emailTemplates.id), eq(emailLogs.campaignId, campaignId)),
        )
        .where(and(eq(campaignTemplates.campaignId, campaignId), eq(emailTemplates.userId, userId), categoryFilter))
        .groupBy(emailTemplates.id)
        .orderBy(sql`count(${emailLogs.id}) ASC`, asc(emailTemplates.id))
        .limit(1);

    const preferred = options?.isFollowup === true
      ? eq(emailTemplates.category, "followup")
      : ne(emailTemplates.category, "followup");
    const [row] = await pick(preferred);
    if (row) return row.template;
    const [fallback] = await pick();
    return fallback?.template;
  }
}

export const templatesRepo = new TemplatesRepo();
