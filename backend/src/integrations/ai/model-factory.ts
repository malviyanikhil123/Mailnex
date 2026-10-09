/**
 * Shared model plumbing for every AI feature: provider + API key + model id in, an
 * AI SDK LanguageModel out, plus one generateText wrapper with the timeout and retry
 * defaults the callers rely on.
 *
 * personalize() and classifyMessages() take an optional modelFactory — the injection
 * seam tests use to swap in a MockLanguageModelV4 from "ai/test".
 */

import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { AiProvider } from "./providers.js";

/** Everything needed to call one model with the user's own key. */
export interface AiModelConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/** Factory function type: given a provider config, returns a language model. */
export type ModelFactory = (config: AiModelConfig) => LanguageModel;

export function defaultModelFactory({ provider, apiKey, model }: AiModelConfig): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
  }
}

export const AI_TIMEOUTS = {
  /** One personalized email. */
  PERSONALIZE_MS: 30_000,
  /** One classification batch of up to INBOX.AI_BATCH_SIZE emails. */
  CLASSIFY_MS: 60_000,
  /** The live check when a key is saved. */
  VERIFY_MS: 10_000,
  /** Default for generateAiText callers that pass nothing. */
  DEFAULT_MS: 60_000,
} as const;

export interface GenerateRequest {
  /** System instructions (the AI SDK v7 `instructions` option). */
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Retries on retryable provider errors (429 / 5xx / network). Default 2. */
  maxRetries?: number;
}

/** One generateText call; returns the model's text. Throws whatever the AI SDK throws. */
export async function generateAiText(
  config: AiModelConfig,
  req: GenerateRequest,
  modelFactory: ModelFactory = defaultModelFactory,
): Promise<string> {
  const { text } = await generateText({
    model: modelFactory(config),
    instructions: req.system,
    prompt: req.prompt,
    maxOutputTokens: req.maxOutputTokens,
    timeout: req.timeoutMs ?? AI_TIMEOUTS.DEFAULT_MS,
    maxRetries: req.maxRetries ?? 2,
  });
  return text;
}

/**
 * Proves the key works with the chosen model: the smallest possible request, no
 * retries, a short timeout. Throws the SDK error on failure; see classifyAiError().
 */
export async function verifyModelAccess(
  config: AiModelConfig,
  modelFactory: ModelFactory = defaultModelFactory,
): Promise<void> {
  await generateAiText(
    config,
    // 16 is the smallest output budget every provider accepts (OpenAI's minimum).
    { prompt: "Reply with the single word OK.", maxOutputTokens: 16, timeoutMs: AI_TIMEOUTS.VERIFY_MS, maxRetries: 0 },
    modelFactory,
  );
}
