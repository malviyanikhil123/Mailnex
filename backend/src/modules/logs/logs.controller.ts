import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth-guard.js";
import { logsRepo } from "./logs.repo.js";
import { listLogsQuerySchema } from "./logs.schema.js";

export async function logsController(app: FastifyInstance) {
  /**
   * GET /logs?status=sent|failed|bounced&search=&page=&limit=
   * Returns email logs joined with contact company/email, newest first.
   */
  app.get("/", { preHandler: authGuard }, async (req, reply) => {
    const query = listLogsQuerySchema.parse(req.query);
    const { rows, total } = await logsRepo.listWithContact(query);
    return reply.code(200).send({ logs: rows, total, page: query.page, limit: query.limit });
  });
}
