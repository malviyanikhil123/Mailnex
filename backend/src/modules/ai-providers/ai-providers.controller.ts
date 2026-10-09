import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { isAiProvider, type AiProvider } from "../../integrations/ai/providers.js";
import { aiProvidersService } from "./ai-providers.service.js";
import { saveAiProviderSchema } from "./ai-providers.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

function getProvider(req: FastifyRequest): AiProvider {
  const { provider } = req.params as { provider: string };
  if (!isAiProvider(provider)) throw Object.assign(new Error(`Unknown AI provider "${provider}"`), { statusCode: 404 });
  return provider;
}

export async function aiProvidersController(app: FastifyInstance) {
  /** GET /ai-providers — every supported provider with its status (keys are never returned). */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send({ providers: await aiProvidersService.list(getUserId(req)) });
  });

  /** PUT /ai-providers/:provider — connect / rotate the key, change the model, make default. */
  app.put("/:provider", { preHandler: authGuard }, async (req, reply) => {
    const provider = getProvider(req);
    const input = saveAiProviderSchema.parse(req.body);
    return reply.code(200).send({ providers: await aiProvidersService.save(getUserId(req), provider, input) });
  });

  /** POST /ai-providers/:provider/default — make this provider the default. */
  app.post("/:provider/default", { preHandler: authGuard }, async (req, reply) => {
    const provider = getProvider(req);
    return reply.code(200).send({ providers: await aiProvidersService.setDefault(getUserId(req), provider) });
  });

  /** DELETE /ai-providers/:provider — remove the key. */
  app.delete("/:provider", { preHandler: authGuard }, async (req, reply) => {
    const provider = getProvider(req);
    return reply.code(200).send({ providers: await aiProvidersService.remove(getUserId(req), provider) });
  });
}
