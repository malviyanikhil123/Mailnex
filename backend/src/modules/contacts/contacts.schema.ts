import { z } from "zod";
import { contactStatus } from "../../db/schema/enums.js";

export const listContactsQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(contactStatus.enumValues as [string, ...string[]])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
