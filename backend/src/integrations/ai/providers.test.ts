import { describe, it, expect } from "vitest";
import {
  AI_PROVIDERS,
  PROVIDERS,
  MODEL_ID_PATTERN,
  defaultModelFor,
  isAiProvider,
  isCuratedModel,
  keyFormatError,
} from "./providers.js";

describe("provider catalog", () => {
  it("has a non-empty curated list for every provider, the first being the default", () => {
    for (const p of AI_PROVIDERS) {
      expect(PROVIDERS[p].models.length).toBeGreaterThan(0);
      expect(defaultModelFor(p)).toBe(PROVIDERS[p].models[0]);
      expect(PROVIDERS[p].keyUrl).toMatch(/^https:\/\//);
    }
  });

  it("keeps the Gemini model the app used before as Google's default", () => {
    expect(defaultModelFor("google")).toBe("gemini-3.5-flash-lite");
  });

  it("recognizes providers and curated models", () => {
    expect(isAiProvider("groq")).toBe(true);
    expect(isAiProvider("mistral")).toBe(false);
    expect(isCuratedModel("anthropic", "claude-sonnet-5-5")).toBe(true);
    expect(isCuratedModel("anthropic", "gpt-5.5")).toBe(false);
  });

  it("accepts realistic custom model ids and refuses unsafe ones", () => {
    for (const ok of ["gpt-5.4-mini", "ft:gpt-5.4-mini:acme:v1", "meta-llama/llama-4-scout-17b-16e-instruct", "models/gemini-x"]) {
      expect(MODEL_ID_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ["", " gpt", "gpt 5", "../secrets", "a/../../b", "gpt?x=1", "-flag", "x".repeat(101)]) {
      expect(MODEL_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("keyFormatError", () => {
  const valid = {
    openai: "sk-proj-" + "a".repeat(40),
    anthropic: "sk-ant-api03-" + "b".repeat(40),
    google: "AIza" + "c".repeat(35),
    groq: "gsk_" + "d".repeat(52),
  } as const;

  it("accepts a well-formed key for each provider", () => {
    for (const p of AI_PROVIDERS) expect(keyFormatError(p, valid[p])).toBeNull();
  });

  it("rejects empty keys and inner whitespace", () => {
    expect(keyFormatError("openai", "")).toMatch(/paste/i);
    expect(keyFormatError("groq", "gsk_abc\ndef" + "d".repeat(40))).toMatch(/spaces or line breaks/);
  });

  it("names the provider a key was pasted from by mistake", () => {
    expect(keyFormatError("openai", valid.anthropic)).toMatch(/key for Anthropic Claude/);
    expect(keyFormatError("google", valid.groq)).toMatch(/key for Groq/);
  });

  it("enforces the length bounds", () => {
    expect(keyFormatError("google", "AIza" + "c".repeat(36))).toMatch(/39 characters/);
    expect(keyFormatError("anthropic", "sk-ant-" + "b".repeat(400))).toMatch(/40–300 characters/);
  });
});
