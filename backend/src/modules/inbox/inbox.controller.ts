import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { settingsService } from "../settings/settings.service.js";
import { inboxService } from "./inbox.service.js";
import {
  bulkSetCategorySchema,
  classifyBodySchema,
  createCategorySchema,
  createRuleSchema,
  deleteCategoryQuerySchema,
  deleteMessagesSchema,
  listMessagesQuerySchema,
  reorderCategoriesSchema,
  setCategorySchema,
  setReadSchema,
  testRuleSchema,
  updateCategorySchema,
  updateRuleSchema,
  updateSyncStateSchema,
} from "./inbox.schema.js";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

/** Parses a positive integer path param, or sends 400 and returns null. */
function parseId(raw: string, reply: FastifyReply): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) {
    reply.code(400).send({ error: "Invalid id" });
    return null;
  }
  return id;
}

export async function inboxController(app: FastifyInstance) {
  // ---- categories ---------------------------------------------------------

  app.get("/categories", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await inboxService.listCategories(getUserId(req)));
  });

  app.post("/categories", { preHandler: authGuard }, async (req, reply) => {
    const input = createCategorySchema.parse(req.body);
    try {
      return reply.code(201).send(await inboxService.createCategory(getUserId(req), input));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "Conflict", message: "You already have a category with that name" });
      }
      throw err;
    }
  });

  app.put("/categories/order", { preHandler: authGuard }, async (req, reply) => {
    const { order } = reorderCategoriesSchema.parse(req.body);
    return reply.code(200).send(await inboxService.reorderCategories(getUserId(req), order));
  });

  app.post("/categories/seed-defaults", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(201).send(await inboxService.seedDefaultCategories(getUserId(req)));
  });

  app.put("/categories/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    const input = updateCategorySchema.parse(req.body);
    try {
      return reply.code(200).send(await inboxService.updateCategory(getUserId(req), id, input));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "Conflict", message: "You already have a category with that name" });
      }
      throw err;
    }
  });

  app.delete("/categories/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    const { reassignTo } = deleteCategoryQuerySchema.parse(req.query);
    const res = await inboxService.deleteCategory(getUserId(req), id, reassignTo ?? null);
    return reply.code(200).send({ deleted: res.deleted, reassigned: res.reassigned });
  });

  // ---- rules --------------------------------------------------------------

  app.get("/categories/:id/rules", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    return reply.code(200).send({ rules: await inboxService.listRules(getUserId(req), id) });
  });

  app.post("/categories/:id/rules", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    const input = createRuleSchema.parse(req.body);
    try {
      return reply.code(201).send(await inboxService.createRule(getUserId(req), id, input));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "Conflict", message: "That rule already exists on this category" });
      }
      throw err;
    }
  });

  app.post("/rules/test", { preHandler: authGuard }, async (req, reply) => {
    const input = testRuleSchema.parse(req.body);
    return reply.code(200).send(await inboxService.testRule(getUserId(req), input));
  });

  app.put("/rules/:ruleId", { preHandler: authGuard }, async (req, reply) => {
    const ruleId = parseId((req.params as { ruleId: string }).ruleId, reply);
    if (ruleId === null) return reply;
    const input = updateRuleSchema.parse(req.body);
    try {
      return reply.code(200).send(await inboxService.updateRule(getUserId(req), ruleId, input));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "Conflict", message: "That rule already exists on this category" });
      }
      throw err;
    }
  });

  app.delete("/rules/:ruleId", { preHandler: authGuard }, async (req, reply) => {
    const ruleId = parseId((req.params as { ruleId: string }).ruleId, reply);
    if (ruleId === null) return reply;
    return reply.code(200).send(await inboxService.deleteRule(getUserId(req), ruleId));
  });

  // ---- messages -----------------------------------------------------------

  app.get("/messages", { preHandler: authGuard }, async (req, reply) => {
    const query = listMessagesQuerySchema.parse(req.query);
    return reply.code(200).send(await inboxService.listMessages(getUserId(req), query));
  });

  app.post("/messages/bulk-category", { preHandler: authGuard }, async (req, reply) => {
    const input = bulkSetCategorySchema.parse(req.body);
    return reply.code(200).send(await inboxService.bulkSetCategory(getUserId(req), input));
  });

  app.post("/messages/delete", { preHandler: authGuard }, async (req, reply) => {
    const { ids } = deleteMessagesSchema.parse(req.body);
    return reply.code(200).send(await inboxService.deleteMessages(getUserId(req), ids));
  });

  app.get("/messages/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    return reply.code(200).send(await inboxService.getMessage(getUserId(req), id));
  });

  app.put("/messages/:id/category", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    const input = setCategorySchema.parse(req.body);
    const updated = await inboxService.setCategory(getUserId(req), id, input.categoryId, input.jobStatus ?? null);
    return reply.code(200).send(updated);
  });

  app.post("/messages/:id/read", { preHandler: authGuard }, async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === null) return reply;
    const { isUnread } = setReadSchema.parse(req.body);
    return reply.code(200).send(await inboxService.setRead(getUserId(req), id, isUnread));
  });

  app.get("/stats", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await inboxService.stats(getUserId(req)));
  });

  // ---- sync / classify ----------------------------------------------------

  app.post("/sync", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const creds = await settingsService.getGmailCreds(userId);
    if (!creds) {
      return reply.code(409).send({
        error: "Conflict",
        code: "NOT_CONFIGURED",
        message: "Save your Gmail app password in Settings before syncing your inbox",
      });
    }
    return reply.code(202).send(inboxService.startSync(userId));
  });

  app.post("/classify", { preHandler: authGuard }, async (req, reply) => {
    const { mode } = classifyBodySchema.parse(req.body ?? {});
    return reply.code(202).send(await inboxService.startClassify(getUserId(req), mode));
  });

  app.get("/jobs/:jobId/progress", { preHandler: authGuard }, async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    return reply.code(200).send(inboxService.getJobProgress(jobId));
  });

  app.get("/sync-state", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const creds = await settingsService.getGmailCreds(userId);
    return reply.code(200).send(await inboxService.getSyncState(userId, !!creds));
  });

  app.put("/sync-state", { preHandler: authGuard }, async (req, reply) => {
    const { enabled } = updateSyncStateSchema.parse(req.body);
    return reply.code(200).send(await inboxService.setSyncEnabled(getUserId(req), enabled));
  });

  app.post("/verify", { preHandler: authGuard }, async (req, reply) => {
    return reply.code(200).send(await inboxService.verify(getUserId(req)));
  });
}
