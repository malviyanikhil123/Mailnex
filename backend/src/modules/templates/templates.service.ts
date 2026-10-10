import { interpolate } from "../../utils/interpolate.js";
import { decodeHtmlEntities, renderHtmlTemplate, sanitizeEmailHtml } from "../../utils/email-html.js";
import { LIMITS } from "../../config/constants.js";
import { TEMPLATE_SEED } from "../../db/seed/templates.js";
import { buildHtmlEmailPrompt, extractHtmlDocument } from "../../integrations/ai/html-email-prompt.js";
import { aiProvidersService, type AiGenerateRequest } from "../ai-providers/ai-providers.service.js";
import {
  templatesRepo as defaultRepo,
  TemplatesRepo,
  type Template,
} from "./templates.repo.js";
import type { CreateTemplateInput, GenerateHtmlInput, TemplateFormat, UpdateTemplateInput } from "./templates.schema.js";

type HttpError = Error & { statusCode: number; expose?: boolean };

function httpError(statusCode: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  // 5xx messages are hidden by the error handler unless marked as meant for the user.
  if (statusCode >= 500) err.expose = true;
  return err;
}

function notFound(id: number): HttpError {
  return httpError(404, `Template ${id} not found`);
}

/** Text generation used by "Generate with AI" (the user's own AI provider key). */
export interface TemplateAi {
  generate(userId: number, req: AiGenerateRequest): Promise<string>;
}

/** Stored HTML is always sanitized; a design with nothing left is refused. */
function cleanHtmlBody(body: string): string {
  const clean = sanitizeEmailHtml(body);
  if (!clean) throw httpError(400, "The HTML has no content left once unsafe parts (scripts, forms, embeds…) are removed");
  return clean;
}

function templateKey(t: { name: string; category: string }): string {
  return `${t.category}\u0000${t.name}`;
}

/** Text of the document's <title>, used as the suggested subject. */
function titleOf(html: string): string | undefined {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? decodeHtmlEntities(match[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim() : "";
  return title ? title.slice(0, 200) : undefined;
}

export const HTML_GENERATION = { MAX_OUTPUT_TOKENS: 8_000, TIMEOUT_MS: 90_000 } as const;

export class TemplatesService {
  constructor(
    private repo: TemplatesRepo,
    private ai: TemplateAi = aiProvidersService,
  ) {}

  async create(userId: number, input: CreateTemplateInput): Promise<Template> {
    const data = input.format === "html" ? { ...input, body: cleanHtmlBody(input.body) } : input;
    return this.repo.create(userId, data);
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

    // A new body, or a switch to HTML, is sanitized against the format it will have.
    const format: TemplateFormat = data.format ?? existing.format ?? "text";
    const switchedToHtml = format === "html" && existing.format !== "html";
    const patch = format === "html" && (data.body !== undefined || switchedToHtml)
      ? { ...data, body: cleanHtmlBody(data.body ?? existing.body) }
      : data;

    const contentChanged =
      (patch.name !== undefined && patch.name !== existing.name) ||
      (patch.subject !== undefined && patch.subject !== existing.subject) ||
      (patch.body !== undefined && patch.body !== existing.body) ||
      (patch.format !== undefined && patch.format !== (existing.format ?? "text"));

    const updated = await this.repo.update(userId, id, {
      ...patch,
      version: contentChanged ? existing.version + 1 : existing.version,
    });
    if (!updated) throw notFound(id);
    return updated;
  }

  async remove(userId: number, id: number): Promise<void> {
    const deleted = await this.repo.remove(userId, id);
    if (!deleted) throw notFound(id);
  }

  /** The template filled with `vars` the way it would be sent (HTML values escaped). */
  async preview(
    userId: number,
    id: number,
    vars: Record<string, string>,
  ): Promise<{ subject: string; body: string; format: TemplateFormat }> {
    const tpl = await this.get(userId, id);
    const format: TemplateFormat = tpl.format === "html" ? "html" : "text";
    return {
      subject: interpolate(tpl.subject, vars),
      body: format === "html" ? renderHtmlTemplate(tpl.body, vars) : interpolate(tpl.body, vars),
      format,
    };
  }

  /**
   * Adds the starter templates the user does not have yet (matched on name + category,
   * the unique key), so running it again adds nothing. Existing templates are untouched.
   */
  async addStarterTemplates(userId: number): Promise<{ added: number }> {
    const have = new Set((await this.repo.listKeys(userId)).map(templateKey));
    const missing = TEMPLATE_SEED.filter((t) => !have.has(templateKey(t)));
    const inserted = await this.repo.createMany(userId, missing);
    return { added: inserted.length };
  }

  /**
   * Asks the user's AI provider for an HTML email design. Nothing is saved: the
   * sanitized HTML (and the <title> as a suggested subject) goes back to the editor.
   */
  async generateHtml(userId: number, input: GenerateHtmlInput): Promise<{ html: string; subject?: string }> {
    const { system, prompt } = buildHtmlEmailPrompt({
      description: input.description,
      tone: input.tone,
      brandColor: input.brandColor || undefined,
      includeVariables: input.includeVariables,
    });
    const raw = await this.ai.generate(userId, {
      provider: input.provider ?? null,
      model: input.model ?? null,
      system,
      prompt,
      maxOutputTokens: HTML_GENERATION.MAX_OUTPUT_TOKENS,
      timeoutMs: HTML_GENERATION.TIMEOUT_MS,
    });

    const html = sanitizeEmailHtml(extractHtmlDocument(raw));
    if (!html) throw httpError(502, "The AI did not return an HTML email — try again or describe the email differently");
    if (Buffer.byteLength(html, "utf8") > LIMITS.TEMPLATE_BODY_MAX_BYTES) {
      throw httpError(502, `The AI returned a design over ${LIMITS.TEMPLATE_BODY_MAX_BYTES / 1024} KB — ask for a simpler layout`);
    }
    const subject = titleOf(html);
    return subject ? { html, subject } : { html };
  }
}

export const templatesService = new TemplatesService(defaultRepo);
