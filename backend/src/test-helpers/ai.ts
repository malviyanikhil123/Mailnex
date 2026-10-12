/**
 * Fake AI models for unit tests.
 *
 * mockModelFactory() returns a ModelFactory whose models are AI SDK
 * MockLanguageModelV4 instances, so tests exercise the real generateText path
 * without any network call. The factory records every config it was built with
 * and every prompt the model received.
 */

import { vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { AiModelConfig, ModelFactory } from "../integrations/ai/model-factory.js";

type MockCallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];

/** A finished doGenerate result carrying `text`. */
export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

/** The user-facing prompt text of one model call (system messages excluded). */
function promptOf(options: MockCallOptions): string {
  return options.prompt
    .filter((m) => m.role === "user")
    .flatMap((m) => m.content)
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

export function mockModelFactory(reply: string | ((prompt: string) => string | Promise<string>)) {
  const configs: AiModelConfig[] = [];
  const prompts: string[] = [];
  const calls: MockCallOptions[] = [];
  const factory = vi.fn((config: AiModelConfig) => {
    configs.push(config);
    return new MockLanguageModelV4({
      provider: config.provider,
      modelId: config.model,
      doGenerate: async (options) => {
        const prompt = promptOf(options);
        prompts.push(prompt);
        calls.push(options);
        return textResult(typeof reply === "function" ? await reply(prompt) : reply);
      },
    });
  });
  return { factory: factory as ModelFactory, factorySpy: factory, configs, prompts, calls };
}

/** A ModelFactory whose model call fails with `err`. */
export function failingModelFactory(err: unknown): ModelFactory {
  return () =>
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw err;
      },
    });
}
