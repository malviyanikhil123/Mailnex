import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { perUserRateLimit } from "../../middleware/rate-limit.js";
import { settingsService } from "./settings.service.js";
import {
  updateGmailSchema,
  senderProfileSchema,
  updateSendingSchema,
  profileFieldsSchema,
} from "./settings.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function settingsController(app: FastifyInstance) {
  /** GET /settings — public (secret-free) view. */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send(await settingsService.getPublic(userId));
  });

  /** PATCH /settings/gmail — verify with Gmail, then store email + encrypted app password.
   *  It logs in with the submitted password, so it is limited per user like /senders. */
  app.patch("/gmail", {
    preHandler: authGuard,
    config: { rateLimit: perUserRateLimit("settings-gmail") },
  }, async (req, reply) => {
    const userId = getUserId(req);
    const input = updateGmailSchema.parse(req.body);
    await settingsService.updateGmail(userId, input);
    return reply.code(200).send({ updated: true });
  });

  /** PATCH /settings/profile — update the sender's My Profile (merged). */
  app.patch("/profile", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = senderProfileSchema.parse(req.body);
    const merged = await settingsService.updateProfile(userId, input);
    return reply.code(200).send(merged);
  });

  /** PATCH /settings/sending — daily cap of the primary Gmail. */
  app.patch("/sending", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = updateSendingSchema.parse(req.body);
    await settingsService.updateSending(userId, input);
    return reply.code(200).send({ updated: true });
  });

  /** GET /settings/profile-fields — custom My Profile fields. */
  app.get("/profile-fields", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    return reply.code(200).send({ fields: await settingsService.getProfileFields(userId) });
  });

  /** PUT /settings/profile-fields — replace the full list of custom fields. */
  app.put("/profile-fields", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const input = profileFieldsSchema.parse(req.body);
    return reply.code(200).send({ fields: await settingsService.replaceProfileFields(userId, input) });
  });
}
