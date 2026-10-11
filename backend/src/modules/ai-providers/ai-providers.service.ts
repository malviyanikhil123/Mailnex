import { encrypt, decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import {
  AI_PROVIDERS,
  PROVIDERS,
  MODEL_ID_PATTERN,
  defaultModelFor,
  isAiProvider,
  isCuratedModel,
  keyFormatError,
  type AiProvider,
} from "../../integrations/ai/providers.js";
import {
  generateAiText,
  verifyModelAccess,
  type AiModelConfig,
  type GenerateRequest,
} from "../../integrations/ai/model-factory.js";
import { classifyAiError } from "../../integrations/ai/errors.js";
import { aiProvidersRepo, type IAiProvidersRepo, type AiProviderKey } from "./ai-providers.repo.js";
import type { SaveAiProviderInput } from "./ai-providers.schema.js";

/** API-safe view of one provider — never includes the key beyond its last 4 characters. */
export interface PublicAiProvider {
  provider: AiProvider;
  label: string;
  configured: boolean;
  /** Last 4 characters of the saved key, so the user can tell keys apart. */
  keyLast4: string | null;
  /** The saved model, or the recommended one while the provider is not configured. */
  defaultModel: string;
  isDefault: boolean;
  /** Curated models; the first is the recommended one. */
  models: string[];
  /** Where to create a key. */
  keyUrl: string;
  updatedAt: Date | null;
}

/** Which provider/model to use; null or absent = the user's default provider and its saved model. */
export interface AiChoice {
  provider?: string | null;
  model?: string | null;
}

export interface AiGenerateRequest extends AiChoice {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** Proves a key works with a model; rejects with the AI SDK error otherwise. */
export type VerifyKey = (config: AiModelConfig) => Promise<void>;
export type GenerateFn = (config: AiModelConfig, req: GenerateRequest) => Promise<string>;

type HttpError = Error & { statusCode: number; expose?: boolean };

function httpError(statusCode: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  // 5xx messages are hidden by the error handler unless marked as meant for the user.
  if (statusCode >= 500) err.expose = true;
  return err;
}

function last4(row: AiProviderKey): string | null {
  try {
    return decrypt(row.apiKeyEnc).slice(-4);
  } catch {
    return null;
  }
}

const SETTINGS_HINT = "Settings → AI providers";

export class AiProvidersService {
  constructor(
    private repo: IAiProvidersRepo = aiProvidersRepo,
    private verify: VerifyKey = (config) => verifyModelAccess(config),
    private generateText: GenerateFn = (config, req) => generateAiText(config, req),
  ) {}

  /** Every supported provider, configured or not, in a fixed order. */
  async list(userId: number): Promise<PublicAiProvider[]> {
    const rows = await this.repo.list(userId);
    return AI_PROVIDERS.map((provider) => {
      const row = rows.find((r) => r.provider === provider);
      const info = PROVIDERS[provider];
      return {
        provider,
        label: info.label,
        configured: !!row,
        keyLast4: row ? last4(row) : null,
        defaultModel: row?.defaultModel ?? defaultModelFor(provider),
        isDefault: row?.isDefault ?? false,
        models: [...info.models],
        keyUrl: info.keyUrl,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async hasAny(userId: number): Promise<boolean> {
    return (await this.repo.list(userId)).length > 0;
  }

  /**
   * Connects a provider or changes it. A new key is format-checked, then checked live
   * with a tiny request; nothing is stored unless the provider accepted it.
   */
  async save(userId: number, provider: AiProvider, input: SaveAiProviderInput): Promise<PublicAiProvider[]> {
    const label = PROVIDERS[provider].label;
    const existing = await this.repo.get(userId, provider);
    const model = input.defaultModel ?? existing?.defaultModel ?? defaultModelFor(provider);
    if (!isCuratedModel(provider, model) && !MODEL_ID_PATTERN.test(model)) {
      throw httpError(400, "Model ids may only contain letters, digits and . _ : / -");
    }

    if (input.apiKey !== undefined) {
      const problem = keyFormatError(provider, input.apiKey);
      if (problem) throw httpError(400, problem);
      await this.verifyOrThrow({ provider, apiKey: input.apiKey, model });
      // The first key becomes the default (in the same transaction as the upsert), so
      // inbox sorting and campaigns work at once.
      await this.repo.upsert(
        userId,
        provider,
        { apiKeyEnc: encrypt(input.apiKey), defaultModel: model },
        { makeDefault: !!input.makeDefault },
      );
    } else {
      if (!existing) throw httpError(400, `Paste an API key to connect ${label}`);
      if (model !== existing.defaultModel) {
        // A curated model is known to exist; a custom one is proven with the saved key.
        if (!isCuratedModel(provider, model)) {
          await this.verifyOrThrow({ provider, apiKey: decrypt(existing.apiKeyEnc), model });
        }
        await this.repo.updateModel(userId, provider, model);
      }
      if (input.makeDefault || !(await this.repo.list(userId)).some((r) => r.isDefault)) {
        await this.repo.setDefault(userId, provider);
      }
    }
    return this.list(userId);
  }

  async setDefault(userId: number, provider: AiProvider): Promise<PublicAiProvider[]> {
    if (!(await this.repo.get(userId, provider))) {
      throw httpError(404, `${PROVIDERS[provider].label} is not configured`);
    }
    await this.repo.setDefault(userId, provider);
    return this.list(userId);
  }

  /** Removes the key. Campaigns that used it fall back to the default provider, and
   *  if it was the default, the oldest remaining key takes over. */
  async remove(userId: number, provider: AiProvider): Promise<PublicAiProvider[]> {
    if (!(await this.repo.remove(userId, provider))) {
      throw httpError(404, `${PROVIDERS[provider].label} is not configured`);
    }
    return this.list(userId);
  }

  /** Models a campaign may pick for a provider (curated + the saved one), or null when
   *  the user has not configured that provider. */
  async allowedModels(userId: number, provider: string): Promise<string[] | null> {
    if (!isAiProvider(provider)) return null;
    const row = await this.repo.get(userId, provider);
    if (!row) return null;
    const curated = PROVIDERS[provider].models;
    return curated.includes(row.defaultModel) ? [...curated] : [...curated, row.defaultModel];
  }

  /**
   * Provider, decrypted key and model for one AI call, or null when there is no usable
   * key: none saved at all, or the chosen provider is not configured. A model is only
   * honored together with an explicit provider.
   */
  async resolve(userId: number, choice: AiChoice = {}): Promise<AiModelConfig | null> {
    const rows = await this.repo.list(userId);
    const row = choice.provider
      ? rows.find((r) => r.provider === choice.provider)
      : rows.find((r) => r.isDefault) ?? rows[0];
    if (!row || !isAiProvider(row.provider)) return null;
    const model = (choice.provider && choice.model) || row.defaultModel || defaultModelFor(row.provider);
    return { provider: row.provider, apiKey: decrypt(row.apiKeyEnc), model };
  }

  /**
   * Reusable text generation for server-side features: resolves the user's key for
   * the chosen (or default) provider and returns the model's text.
   *
   * Throws a 400 when no matching key is configured or the provider rejects the saved
   * key or model, a 429 when it is rate limited, and a 502 when it cannot be reached.
   */
  async generate(userId: number, req: AiGenerateRequest): Promise<string> {
    if (req.provider != null && !isAiProvider(req.provider)) {
      throw httpError(400, `Unknown AI provider "${req.provider}"`);
    }
    if (req.model != null && !MODEL_ID_PATTERN.test(req.model)) {
      throw httpError(400, "Model ids may only contain letters, digits and . _ : / -");
    }
    const config = await this.resolve(userId, { provider: req.provider, model: req.model });
    if (!config) {
      throw httpError(
        400,
        req.provider
          ? `${PROVIDERS[req.provider as AiProvider].label} is not configured — add its API key in ${SETTINGS_HINT}`
          : `No AI provider is configured — add an API key in ${SETTINGS_HINT}`,
      );
    }
    const label = PROVIDERS[config.provider].label;
    try {
      return await this.generateText(config, {
        system: req.system,
        prompt: req.prompt,
        maxOutputTokens: req.maxOutputTokens,
        timeoutMs: req.timeoutMs,
      });
    } catch (err) {
      const { kind, statusCode } = classifyAiError(err);
      logger.warn({ userId, provider: config.provider, model: config.model, kind, statusCode }, "AI generation failed");
      switch (kind) {
        case "auth":
          throw httpError(400, `${label} rejected the saved API key — update it in ${SETTINGS_HINT}`);
        case "model":
          throw httpError(400, `${label} does not offer the model "${config.model}" to your key`);
        case "quota":
          throw httpError(429, `${label} is rate limiting your key or it has run out of credits — try again later`);
        case "timeout":
          throw httpError(504, `${label} took too long to answer — try again`);
        case "network":
          throw httpError(502, `${label} could not be reached — try again in a moment`);
        default:
          throw statusCode && statusCode < 500
            ? httpError(400, `${label} refused the request (HTTP ${statusCode})`)
            : httpError(502, `${label} returned an unexpected error — try again in a moment`);
      }
    }
  }

  // ---- helpers ---------------------------------------------------------------

  private async verifyOrThrow(config: AiModelConfig): Promise<void> {
    const label = PROVIDERS[config.provider].label;
    try {
      await this.verify(config);
    } catch (err) {
      // Only the outcome is logged: never the key, and not the provider's response body.
      const { kind, statusCode } = classifyAiError(err);
      logger.info({ provider: config.provider, model: config.model, kind, statusCode }, "AI key check failed");
      switch (kind) {
        case "auth":
          throw httpError(400, `The provider rejected this key. Check that you copied the whole ${label} key and that it is still active.`);
        case "model":
          throw httpError(400, `${label} does not offer the model "${config.model}" to this key. Pick another model.`);
        case "quota":
          throw httpError(400, `${label} accepted the key but refused the request (rate limit or no remaining credits). Check your plan and billing, then try again.`);
        case "timeout":
        case "network":
          throw httpError(502, `Could not reach ${label} to check the key. Try again in a moment.`);
        default:
          throw statusCode && statusCode < 500
            ? httpError(400, `${label} refused the test request (HTTP ${statusCode}). Check the key and the model, then try again.`)
            : httpError(502, `${label} returned an unexpected error while checking the key. Try again in a moment.`);
      }
    }
  }
}

export const aiProvidersService = new AiProvidersService();
