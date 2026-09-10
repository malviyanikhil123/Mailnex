import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { leadDiscoveryService } from "./lead-discovery.service.js";
import type { CreateDiscoveryJobInput, ListLeadsQuery, ImportLeadsInput } from "./lead-discovery.types.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function leadDiscoveryController(app: FastifyInstance) {
  // Start a new discovery job
  app.post(
    "/jobs",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const input = (req.body as CreateDiscoveryJobInput) || {};
      const job = await leadDiscoveryService.startJob(userId, input);
      return reply.code(201).send(job);
    }
  );

  // List recent discovery jobs
  app.get(
    "/jobs",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const q = req.query as { limit?: string };
      const limit = q?.limit ? parseInt(q.limit, 10) : 20;
      const jobs = await leadDiscoveryService.listJobs(userId, limit);
      return reply.code(200).send({ jobs });
    }
  );

  // Get job details and live progress
  app.get(
    "/jobs/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const jobId = parseInt(idStr, 10);
      if (isNaN(jobId)) {
        return reply.code(400).send({ error: "Invalid job id" });
      }

      const job = await leadDiscoveryService.getJob(userId, jobId);
      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }
      return reply.code(200).send(job);
    }
  );

  // Delete a discovery job
  app.delete(
    "/jobs/:id",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { id: idStr } = req.params as { id: string };
      const jobId = parseInt(idStr, 10);
      if (isNaN(jobId)) {
        return reply.code(400).send({ error: "Invalid job id" });
      }

      const deleted = await leadDiscoveryService.deleteJob(userId, jobId);
      if (!deleted) {
        return reply.code(404).send({ error: "Job not found" });
      }
      return reply.code(200).send({ deleted: true });
    }
  );

  // List discovered leads with search & filters
  app.get(
    "/leads",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const q = (req.query as {
        jobId?: string;
        emailCategory?: string;
        companyType?: string;
        search?: string;
        isImported?: string;
        page?: string;
        limit?: string;
      }) || {};

      const query: ListLeadsQuery = {
        jobId: q.jobId ? parseInt(q.jobId, 10) : undefined,
        emailCategory: q.emailCategory,
        companyType: q.companyType,
        search: q.search,
        isImported: q.isImported !== undefined ? q.isImported === "true" : undefined,
        page: q.page ? parseInt(q.page, 10) : 1,
        limit: q.limit ? parseInt(q.limit, 10) : 20,
      };

      const result = await leadDiscoveryService.listLeads(userId, query);
      return reply.code(200).send(result);
    }
  );

  // Get aggregate statistics & daily trend
  app.get(
    "/stats",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const stats = await leadDiscoveryService.getStats(userId);
      return reply.code(200).send(stats);
    }
  );

  // Import selected leads into Mailnex Contacts
  app.post(
    "/leads/import",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(req);
      const body = req.body as ImportLeadsInput;
      const leadIds = body?.leadIds || [];
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return reply.code(400).send({ error: "No leads selected for import" });
      }

      const result = await leadDiscoveryService.importLeads(userId, leadIds);
      return reply.code(200).send(result);
    }
  );
}
