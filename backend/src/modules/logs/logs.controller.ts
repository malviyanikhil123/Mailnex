import type { FastifyInstance, FastifyRequest } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { logsRepo } from "./logs.repo.js";
import { listLogsQuerySchema } from "./logs.schema.js";

function getUserId(req: FastifyRequest): number {
  return (req.user as { sub: number }).sub;
}

export async function logsController(app: FastifyInstance) {
  /**
   * GET /logs?status=sent|failed|bounced&search=&page=&limit=
   * Returns email logs joined with contact company/email for the logged-in user.
   */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    const userId = getUserId(req);
    const query = listLogsQuerySchema.parse(req.query);
    const { rows, total } = await logsRepo.listWithContact(userId, query);
    return reply.code(200).send({ logs: rows, total, page: query.page, limit: query.limit });
  });
}
