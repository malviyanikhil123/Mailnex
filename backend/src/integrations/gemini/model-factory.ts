/**
 * Shared Gemini model plumbing.
 *
 * Extracted from client.ts so the classifier can reuse the exact same fallback
 * chain and injection seam. client.ts re-exports these, and personalize()'s
 * signature is unchanged — client.test.ts passing untouched is the proof.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../../utils/logger.js";

/** Minimal interface for the generative model — matches GoogleGenerativeAI's
 *  GenerativeModel.generateContent signature. */
export interface GenerativeModelLike {
  generateContent(prompt: string): Promise<{ response: { text: () => string } }>;
}

/** Factory function type: given an API key, returns a model-like object. */
export type ModelFactory = (apiKey: string) => GenerativeModelLike;

export const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

export function defaultModelFactory(apiKey: string): GenerativeModelLike {
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
