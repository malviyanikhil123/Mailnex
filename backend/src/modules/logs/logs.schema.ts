import { z } from "zod";
import { SEARCH_MAX_LENGTH } from "../../utils/like.js";

export const listLogsQuerySchema = z.object({
  status: z.enum(["sent", "failed", "bounced"]).optional(),
  search: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;
