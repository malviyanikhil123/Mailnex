import { z } from "zod";

/**
 * Save a provider: connect it (apiKey required the first time), rotate its key,
 * change its model, and/or make it the default. The key is write-only.
 *
 * defaultModel may be one of the provider's curated models or any custom model id
 * matching MODEL_ID_PATTERN; a custom id is checked live with the provider first.
 */
export const saveAiProviderSchema = z.object({
  apiKey: z.string().trim().min(1).max(500).optional(),
  defaultModel: z.string().trim().min(1).max(100).optional(),
  makeDefault: z.boolean().optional(),
});
export type SaveAiProviderInput = z.infer<typeof saveAiProviderSchema>;
