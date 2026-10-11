/**
 * AI email personalization.
 *
 * personalize(input, modelFactory?) — personalizes an email template with the
 * provider and model the campaign picked (or the user's default one).
 *
 * Behavior:
 *  - If no AI config is given (AI off, or no key saved) → return the template
 *    interpolated with vars, aiUsed: false. The model is never called.
 *  - Otherwise → call the model with a constrained prompt. Parse the model's
 *    text output as JSON and validate with Zod. On success →
 *    { subject, body, aiUsed: true }.
 *  - On ANY error (model throws, network error, timeout, invalid JSON, Zod
 *    validation failure, empty response) → fallback to the interpolated
 *    template, aiUsed: false. Never throws out of personalize().
 *  - The same fallback applies when the model's text holds a link that the
 *    template does not: contact fields reach the prompt, so a crafted company
 *    name must not be able to make the model plant a URL in the email.
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
  template: { subject: string; body: string };
  vars: PersonalizeVars;
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
// Link check
// ---------------------------------------------------------------------------

/** http(s) and www. links, ended by whitespace, quotes or angle brackets. */
const LINK = /(?:https?:\/\/|www\.)[^\s"'<>]+/gi;

/** The links in a text, lower-cased and without trailing sentence punctuation. */
export function linksIn(text: string): string[] {
  return (text.match(LINK) ?? []).map((l) => l.replace(/[.,;:!?)\]}*]+$/, "").toLowerCase());
}

/** Links in the model's output that the (already filled-in) template does not contain. */
export function unexpectedLinks(
  output: { subject: string; body: string },
  template: { subject: string; body: string },
): string[] {
  const allowed = new Set(linksIn(`${template.subject}
${template.body}`));
  return linksIn(`${output.subject}
${output.body}`).filter((l) => !allowed.has(l));
}

// ---------------------------------------------------------------------------
// Interpolation helper
// ---------------------------------------------------------------------------

function interpolateTemplate(
  template: { subject: string; body: string },
  vars: PersonalizeVars,
): { subject: string; body: string } {
  const flat: Record<string, string> = {
    company: vars.company,
    location: vars.location,
    // Legacy variable names from the job-seeker templates.
    candidateName: vars.sender.name,
    ...(vars.sender.email ? { candidateEmail: vars.sender.email } : {}),
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

  // No AI config → return interpolated template without calling the model
  if (!ai?.apiKey) {
    const { subject, body } = interpolateTemplate(template, vars);
    return { subject, body, aiUsed: false };
  }
  const where = { provider: ai.provider, model: ai.model };

  // Attempt AI personalization — any failure falls back to interpolated template
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
      const { subject, body } = interpolateTemplate(template, vars);
      return { subject, body, aiUsed: false };
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
      const { subject, body } = interpolateTemplate(template, vars);
      return { subject, body, aiUsed: false };
    }

    const validated = personalizationSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(
        { reason: "zod_validation_failed", ...where, errors: validated.error.issues },
        "AI JSON failed schema validation — falling back to interpolated template",
      );
      const { subject, body } = interpolateTemplate(template, vars);
      return { subject, body, aiUsed: false };
    }

    const unexpected = unexpectedLinks(validated.data, interpolateTemplate(template, vars));
    if (unexpected.length > 0) {
      logger.warn(
        { reason: "unexpected_link", ...where, links: unexpected.slice(0, 5) },
        "AI output added a link the template does not have — falling back to interpolated template",
      );
      const { subject, body } = interpolateTemplate(template, vars);
      return { subject, body, aiUsed: false };
    }

    return {
      subject: validated.data.subject,
      body: validated.data.body,
      aiUsed: true,
    };
  } catch (err) {
    logger.warn(
      { reason: "model_error", ...where, err: describeAiError(err) },
      "AI personalization failed — falling back to interpolated template",
    );
    const { subject, body } = interpolateTemplate(template, vars);
    return { subject, body, aiUsed: false };
  }
}
