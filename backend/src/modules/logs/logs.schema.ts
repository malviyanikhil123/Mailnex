import { z } from "zod";

export const listLogsQuerySchema = z.object({
  status: z.enum(["sent", "failed", "bounced"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;
