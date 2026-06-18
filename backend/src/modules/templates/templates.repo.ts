import { db } from "../../db/index.js";
import { emailTemplates } from "../../db/schema/templates.js";
import { eq, sql } from "drizzle-orm";
import type { CreateTemplateInput, UpdateTemplateInput } from "./templates.schema.js";

export type Template = typeof emailTemplates.$inferSelect;

export class TemplatesRepo {
  async create(input: CreateTemplateInput): Promise<Template> {
    const [row] = await db
      .insert(emailTemplates)
      .values(input)
      .returning();
    return row;
  }

  async update(id: number, data: Partial<UpdateTemplateInput> & { version?: number }): Promise<Template | null> {
    const [row] = await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: number): Promise<{ id: number } | null> {
    const [row] = await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .returning({ id: emailTemplates.id });
    return row ?? null;
  }

  async list(): Promise<Template[]> {
    return db.select().from(emailTemplates);
  }

  async getById(id: number): Promise<Template | null> {
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id));
    return row ?? null;
  }

  async pickRandomActive(): Promise<Template | undefined> {
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.active, true))
      .orderBy(sql`random()`)
      .limit(1);
    return row;
  }
}

export const templatesRepo = new TemplatesRepo();
