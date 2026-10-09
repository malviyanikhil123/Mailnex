/**
 * The AI providers a user can connect, with a curated model list per provider.
 *
 * The first model of each list is the provider's default: the cheapest fast model,
 * since personalization runs once per outgoing email. A user may also save any
 * other model id that matches MODEL_ID_PATTERN — it is checked live with the
 * provider before it is stored, so the curated list never blocks a new model.
 */

export const AI_PROVIDERS = ["openai", "anthropic", "google", "groq"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface ProviderInfo {
  label: string;
  /** Curated model ids; the first one is the default. */
  models: readonly string[];
  /** Where the user creates an API key. */
  keyUrl: string;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    models: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4", "gpt-5.5", "gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-4.1-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic Claude",
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  google: {
    // gemini-3.5-flash-lite was the first model the Gemini-only version of the app
    // tried, so keys carried over from it keep behaving the same.
    label: "Google Gemini",
    models: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview"],
    keyUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    label: "Groq",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "meta-llama/llama-4-scout-17b-16e-instruct", "moonshotai/kimi-k2-instruct-0905"],
    keyUrl: "https://console.groq.com/keys",
  },
};

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

export function defaultModelFor(provider: AiProvider): string {
  return PROVIDERS[provider].models[0]!;
}

export function isCuratedModel(provider: AiProvider, model: string): boolean {
  return PROVIDERS[provider].models.includes(model);
}

/** A custom model id: letters, digits and . _ : / - only, and no "..", so it is safe in
 *  a URL path (Gemini puts the model id in the request path). */
export const MODEL_ID_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

// ---------------------------------------------------------------------------
// API key format checks — run before the live check so an obvious paste mistake
// gets a specific message instead of a generic "the provider rejected this key".
// The frontend mirrors these rules (components/settings/AiProvidersSection.tsx).
// ---------------------------------------------------------------------------

interface KeyFormat {
  pattern: RegExp;
  min: number;
  max: number;
  hint: string;
}

const KEY_FORMATS: Record<AiProvider, KeyFormat> = {
  openai: { pattern: /^sk-[A-Za-z0-9_-]+$/, min: 20, max: 300, hint: 'OpenAI keys start with "sk-"' },
  anthropic: { pattern: /^sk-ant-[A-Za-z0-9_-]+$/, min: 40, max: 300, hint: 'Anthropic keys start with "sk-ant-"' },
  google: { pattern: /^AIza[A-Za-z0-9_-]{35}$/, min: 39, max: 39, hint: 'Google AI Studio keys start with "AIza" and are 39 characters long' },
  groq: { pattern: /^gsk_[A-Za-z0-9]+$/, min: 40, max: 200, hint: 'Groq keys start with "gsk_"' },
};

/** Which provider a key looks like it belongs to, judging by its prefix. */
function guessProvider(key: string): AiProvider | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("gsk_")) return "groq";
  return null;
}

/**
 * Returns a user-facing problem with the key's format, or null when it looks right.
 * Expects an already-trimmed key; inner whitespace is always rejected.
 */
export function keyFormatError(provider: AiProvider, key: string): string | null {
  const format = KEY_FORMATS[provider];
  if (key.length === 0) return "Paste an API key";
  if (/\s/.test(key)) return "The key must not contain spaces or line breaks";
  const guessed = guessProvider(key);
  if (guessed && guessed !== provider) {
    return `This looks like a key for ${PROVIDERS[guessed].label} — ${format.hint}`;
  }
  if (!format.pattern.test(key)) return format.hint;
  if (key.length < format.min || key.length > format.max) {
    return format.min === format.max
      ? format.hint
      : `${PROVIDERS[provider].label} keys are ${format.min}–${format.max} characters long — check that you copied the whole key`;
  }
  return null;
}
