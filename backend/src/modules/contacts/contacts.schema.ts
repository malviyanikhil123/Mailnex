import { z } from "zod";
import { contactStatus } from "../../db/schema/enums.js";
import { SEARCH_MAX_LENGTH } from "../../utils/like.js";

export const listContactsQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
  status: z
    .enum(contactStatus.enumValues as [string, ...string[]])
    .optional(),
  importId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

/** Without page/limit every import is returned (the import pickers need them all). */
export const listImportsQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
  sort: z.enum(["newest", "oldest"]).default("oldest"),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;
