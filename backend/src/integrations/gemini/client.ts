/**
 * Gemini personalization client.
 *
 * personalize(input, modelFactory?) — personalizes an email template using
 * Gemini's generative AI model.
 *
 * Behavior:
 *  - If apiKey is empty/missing → return the template interpolated with vars,
 *    aiUsed: false. The model is never called.
 *  - If apiKey is present → call Gemini with a constrained prompt. Parse the
 *    model's text output as JSON and validate with Zod. On success →
 *    { subject, body, aiUsed: true }.
 *  - On ANY error (model throws, network error, invalid JSON, Zod validation
 *    failure, empty response) → fallback to the interpolated template,
 *    aiUsed: false. Never throws out of personalize().
 *
 * The optional `modelFactory` parameter enables dependency injection in tests.
 * In production it defaults to constructing the real GoogleGenerativeAI client.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { interpolate } from "../../utils/interpolate.js";
import { logger } from "../../utils/logger.js";
import { buildPersonalizationPrompt } from "./prompt.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonalizeVars {
  company: string;
  location: string;
  candidate: { name: string; email?: string };
}

export interface PersonalizeInput {
  template: { subject: string; body: string };
  vars: PersonalizeVars;
  apiKey?: string;
}

export interface PersonalizeResult {
  subject: string;
  body: string;
  aiUsed: boolean;
}

/** Minimal interface for the generative model — matches GoogleGenerativeAI's
 *  GenerativeModel.generateContent signature. */
export interface GenerativeModelLike {
  generateContent(prompt: string): Promise<{ response: { text: () => string } }>;
}

/** Factory function type: given an API key, returns a model-like object. */
export type ModelFactory = (apiKey: string) => GenerativeModelLike;

// ---------------------------------------------------------------------------
// Zod schema for validating model JSON output
// ---------------------------------------------------------------------------

const personalizationSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

function defaultModelFactory(apiKey: string): GenerativeModelLike {
  const client = new GoogleGenerativeAI(apiKey);
  return {
    async generateContent(prompt: string) {
      let lastError: unknown;
      for (const modelName of CANDIDATE_MODELS) {
        try {
          const model = client.getGenerativeModel({ model: modelName });
          const res = await model.generateContent(prompt);
          return res;
        } catch (err: any) {
          lastError = err;
          logger.warn(
            { model: modelName, error: err?.message || String(err) },
            "Gemini model failed, attempting next fallback model",
          );
        }
      }
      throw lastError;
    },
  };
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
    candidateName: vars.candidate.name,
    ...(vars.candidate.email ? { candidateEmail: vars.candidate.email } : {}),
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
  const { template, vars, apiKey } = input;

  // No API key → return interpolated template without calling the model
  if (!apiKey) {
    const { subject, body } = interpolateTemplate(template, vars);
    return { subject, body, aiUsed: false };
  }

  // Attempt AI personalization — any failure falls back to interpolated template
  try {
    const model = modelFactory(apiKey);

    const promptText = buildPersonalizationPrompt({
      subject: template.subject,
      body: template.body,
      company: vars.company,
      location: vars.location,
      candidateName: vars.candidate.name,
    });

    const result = await model.generateContent(promptText);
    const rawText = result.response.text();

    if (!rawText || rawText.trim() === "") {
      logger.warn(
        { reason: "empty_response" },
        "Gemini returned empty response — falling back to interpolated template",
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
        { reason: "json_parse_error", raw: rawText.slice(0, 200) },
        "Gemini returned non-JSON text — falling back to interpolated template",
      );
      const { subject, body } = interpolateTemplate(template, vars);
      return { subject, body, aiUsed: false };
    }

    const validated = personalizationSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(
        { reason: "zod_validation_failed", errors: validated.error.issues },
        "Gemini JSON failed schema validation — falling back to interpolated template",
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
      { reason: "model_error", err },
      "Gemini personalization failed — falling back to interpolated template",
    );
    const { subject, body } = interpolateTemplate(template, vars);
    return { subject, body, aiUsed: false };
  }
}
