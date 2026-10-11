/**
 * AI email personalization.
 *
 * personalize(input, modelFactory?) — personalizes an email template with the
 * provider and model the campaign picked (or the user's default one).
 *
 * Behavior:
 *  - If no AI config is given (AI off, or no key saved) → return the template
 *    filled in with its values, aiUsed: false. The model is never called.
 *  - Otherwise → call the model with a constrained prompt. The template goes to the
 *    model with its {{placeholders}} unfilled: the contact's own fields reach it only
 *    inside the fenced CONTACT DATA block (see prompt.ts), and every placeholder is
 *    filled in after the model answers. Parse the model's text output as JSON and
 *    validate with Zod. On success → { subject, body, aiUsed: true }.
 *  - On ANY error (model throws, network error, timeout, invalid JSON, Zod
 *    validation failure, empty response) → fallback to the filled-in template,
 *    aiUsed: false. Never throws out of personalize().
 *  - The same fallback applies when the finished email names a host (a URL, a bare
 *    domain such as evil.com/login, or an email domain) that neither the filled-in
 *    template nor the sender's own profile has: contact fields reach the prompt,
 *    so a crafted company name must not be able to make the model plant a link.
 *
 * JSON is asked for in the prompt rather than through a provider's structured
 * output mode, because not every model on every provider supports the latter.
 *
 * The optional `modelFactory` parameter enables dependency injection in tests.
 * In production it builds the real AI SDK provider model.
 */

import { z } from "zod";
import { interpolate } from "../../utils/interpolate.js";
import { logger } from "../../utils/logger.js";
import { buildPersonalizationPrompt } from "./prompt.js";
import { describeAiError } from "./errors.js";
import {
  AI_TIMEOUTS,
  defaultModelFactory,
  generateAiText,
  type AiModelConfig,
  type ModelFactory,
} from "./model-factory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonalizeVars {
  /** The contact's company and location; blank when unknown. */
  company: string;
  location: string;
  /** The contact's first name; blank or absent when unknown. */
  firstName?: string;
  /** Who the email is from ("My Profile"). */
  sender: { name: string; email?: string };
}

export interface PersonalizeInput {
  /** The template as written, {{placeholders}} unfilled. */
  template: { subject: string; body: string };
  vars: PersonalizeVars;
  /**
   * Every placeholder value (contact, custom fields, profile, sender). Filled into the
   * template for the fallback, and into the model's answer.
   */
  values?: Record<string, string>;
  /** The sender's own values (profile, signature): hosts named here may appear in the email. */
  trustedText?: string[];
  /** Provider, key and model to use; absent = send the template as written. */
  ai?: AiModelConfig;
  language?: string;
  instructions?: string;
}

export interface PersonalizeResult {
  subject: string;
  body: string;
  aiUsed: boolean;
}

// ---------------------------------------------------------------------------
// Zod schema for validating model JSON output
// ---------------------------------------------------------------------------

const personalizationSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

// ---------------------------------------------------------------------------
// Host check
// ---------------------------------------------------------------------------

/** Hosts of scheme URLs, IP literals included ("https://1.2.3.4/x"). */
const SCHEME_URL = /\b[a-z][a-z0-9+.-]*:\/\/([^\s"'<>/?#\\]+)/gi;

/**
 * Bare domains, as mail clients turn them into links: dot-separated labels ending in a
 * letters-only TLD of 2+ characters, not glued to a longer word, and not the local part
 * of an email address ("first.last@…"). "e.g.", "i.e.", "3.5" and "v1.2" don't match.
 */
const BARE_DOMAIN = /(?<![\w.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))(?![\w@-])/gi;

/** "TLDs" that in prose are file names or code ("report.pdf", "Node.js"), not links. */
const NOT_TLDS = new Set([
  "txt", "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "doc", "docx", "xls", "xlsx",
  "csv", "ppt", "pptx", "html", "htm", "json", "xml", "css", "js", "jsx", "ts", "tsx", "py", "rb",
  "md", "sh", "exe", "dll", "log", "yml", "yaml", "ini", "cfg", "java", "cpp",
]);

function normalizeHost(host: string): string {
  return host
    .replace(/^[^@]*@/, "") // user:pass@
    .replace(/:\d+$/, "") // :port
    .replace(/\.$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
}

/** Every host a text names: URL hosts, bare domains and email domains, lower-cased. */
export function hostsIn(text: string): Set<string> {
  const hosts = new Set<string>();
  for (const m of text.matchAll(SCHEME_URL)) {
    const host = normalizeHost(m[1]);
    if (host) hosts.add(host);
  }
  for (const m of text.matchAll(BARE_DOMAIN)) {
    if (NOT_TLDS.has(m[2].toLowerCase())) continue;
    hosts.add(normalizeHost(m[1]));
  }
  return hosts;
}

/** Hosts in the output that none of the trusted texts name. */
export function unexpectedHosts(output: { subject: string; body: string }, trusted: string[]): string[] {
  const allowed = hostsIn(trusted.join("\n"));
  return [...hostsIn(`${output.subject}\n${output.body}`)].filter((h) => !allowed.has(h));
}

// ---------------------------------------------------------------------------
// Interpolation helper
// ---------------------------------------------------------------------------

function fill(
  template: { subject: string; body: string },
  input: Pick<PersonalizeInput, "vars" | "values">,
): { subject: string; body: string } {
  const { vars, values } = input;
  const flat: Record<string, string> = {
    company: vars.company,
    location: vars.location,
    // Legacy variable names from the job-seeker templates.
    candidateName: vars.sender.name,
    ...(vars.sender.email ? { candidateEmail: vars.sender.email } : {}),
    ...values,
  };
  return {
    subject: interpolate(template.subject, flat),
    body: interpolate(template.body, flat),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function personalize(
  input: PersonalizeInput,
  modelFactory: ModelFactory = defaultModelFactory,
): Promise<PersonalizeResult> {
  const { template, vars, ai } = input;
  const filled = fill(template, input);
  const fallback = (): PersonalizeResult => ({ ...filled, aiUsed: false });

  // No AI config → return the filled-in template without calling the model
  if (!ai?.apiKey) return fallback();
  const where = { provider: ai.provider, model: ai.model };

  // Attempt AI personalization — any failure falls back to the filled-in template
  try {
    const promptText = buildPersonalizationPrompt({
      subject: template.subject,
      body: template.body,
      company: vars.company,
      location: vars.location,
      firstName: vars.firstName,
      senderName: vars.sender.name,
      language: input.language,
      instructions: input.instructions,
    });

    const rawText = await generateAiText(
      ai,
      { prompt: promptText, timeoutMs: AI_TIMEOUTS.PERSONALIZE_MS },
      modelFactory,
    );

    if (!rawText || rawText.trim() === "") {
      logger.warn(
        { reason: "empty_response", ...where },
        "AI returned empty response — falling back to interpolated template",
      );
      return fallback();
    }

    // Strip optional markdown code fences (```json ... ```) that the model
    // sometimes adds despite being told not to.
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn(
        { reason: "json_parse_error", ...where, raw: rawText.slice(0, 200) },
        "AI returned non-JSON text — falling back to interpolated template",
      );
      return fallback();
    }

    const validated = personalizationSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(
        { reason: "zod_validation_failed", ...where, errors: validated.error.issues },
        "AI JSON failed schema validation — falling back to interpolated template",
      );
      return fallback();
    }

    // Fill the placeholders the model kept, then check the finished email: a placeholder
    // the model added on its own must not bring in a host either.
    const result = fill(validated.data, input);
    const unexpected = unexpectedHosts(result, [filled.subject, filled.body, ...(input.trustedText ?? [])]);
    if (unexpected.length > 0) {
      logger.warn(
        { reason: "unexpected_link", ...where, hosts: unexpected.slice(0, 5) },
        "AI output names a link or domain the template does not have — falling back to interpolated template",
      );
      return fallback();
    }

    return { ...result, aiUsed: true };
  } catch (err) {
    logger.warn(
      { reason: "model_error", ...where, err: describeAiError(err) },
      "AI personalization failed — falling back to interpolated template",
    );
    return fallback();
  }
}
