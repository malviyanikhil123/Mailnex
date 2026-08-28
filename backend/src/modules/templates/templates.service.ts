import { interpolate } from "../../utils/interpolate.js";
import {
  templatesRepo as defaultRepo,
  TemplatesRepo,
  type Template,
} from "./templates.repo.js";
import type { CreateTemplateInput, UpdateTemplateInput } from "./templates.schema.js";

function notFound(id: number): Error & { statusCode: number } {
  const err = new Error(`Template ${id} not found`) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

export class TemplatesService {
  constructor(private repo: TemplatesRepo) {}

  async create(userId: number, input: CreateTemplateInput): Promise<Template> {
    return this.repo.create(userId, input);
  }

  async list(userId: number): Promise<Template[]> {
    return this.repo.list(userId);
  }

  async get(userId: number, id: number): Promise<Template> {
    const tpl = await this.repo.getById(userId, id);
    if (!tpl) throw notFound(id);
    return tpl;
  }

  async update(userId: number, id: number, data: UpdateTemplateInput): Promise<Template> {
    const existing = await this.repo.getById(userId, id);
    if (!existing) throw notFound(id);

    const contentChanged =
      (data.name !== undefined && data.name !== existing.name) ||
      (data.subject !== undefined && data.subject !== existing.subject) ||
      (data.body !== undefined && data.body !== existing.body);

    const updated = await this.repo.update(userId, id, {
      ...data,
      version: contentChanged ? existing.version + 1 : existing.version,
    });
    if (!updated) throw notFound(id);
    return updated;
  }

  async remove(userId: number, id: number): Promise<void> {
    const deleted = await this.repo.remove(userId, id);
    if (!deleted) throw notFound(id);
  }

  async preview(
    userId: number,
    id: number,
    vars: Record<string, string>,
  ): Promise<{ subject: string; body: string }> {
    const tpl = await this.get(userId, id);
    return {
      subject: interpolate(tpl.subject, vars),
      body: interpolate(tpl.body, vars),
    };
  }
}

export const templatesService = new TemplatesService(defaultRepo);
