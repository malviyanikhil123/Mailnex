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

  async create(input: CreateTemplateInput): Promise<Template> {
    return this.repo.create(input);
  }

  async list(): Promise<Template[]> {
    return this.repo.list();
  }

  async get(id: number): Promise<Template> {
    const tpl = await this.repo.getById(id);
    if (!tpl) throw notFound(id);
    return tpl;
  }

  async update(id: number, data: UpdateTemplateInput): Promise<Template> {
    const existing = await this.repo.getById(id);
    if (!existing) throw notFound(id);

    const updated = await this.repo.update(id, {
      ...data,
      version: existing.version + 1,
    });
    if (!updated) throw notFound(id);
    return updated;
  }

  async remove(id: number): Promise<void> {
    const deleted = await this.repo.remove(id);
    if (!deleted) throw notFound(id);
  }

  async pickRandomActive(): Promise<Template | undefined> {
    return this.repo.pickRandomActive();
  }

  async preview(
    id: number,
    vars: Record<string, string>,
  ): Promise<{ subject: string; body: string }> {
    const tpl = await this.get(id);
    return {
      subject: interpolate(tpl.subject, vars),
      body: interpolate(tpl.body, vars),
    };
  }
}

export const templatesService = new TemplatesService(defaultRepo);
