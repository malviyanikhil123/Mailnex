import { db } from "../../db/index.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { and, eq, ne, sql } from "drizzle-orm";
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

  async list(userId: number): Promise<Template[]> {
    return db.select().from(emailTemplates).where(eq(emailTemplates.userId, userId));
  }

  async getById(userId: number, id: number): Promise<Template | null> {
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, userId)));
    return row ?? null;
  }

  async pickRandomActive(userId: number, options?: { isFollowup?: boolean }): Promise<Template | undefined> {
    const conditions = [eq(emailTemplates.active, true), eq(emailTemplates.userId, userId)];

    if (options?.isFollowup === true) {
      conditions.push(eq(emailTemplates.category, "followup"));
    } else {
      // First-time contacts: NEVER pick followup templates
      conditions.push(ne(emailTemplates.category, "followup"));
    }

    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(and(...conditions))
      .orderBy(sql`random()`)
      .limit(1);

    if (row) return row;

    // Fallback to any active template for this user
    const [fallback] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.active, true), eq(emailTemplates.userId, userId)))
      .orderBy(sql`random()`)
      .limit(1);

    return fallback;
  }
}

export const templatesRepo = new TemplatesRepo();
