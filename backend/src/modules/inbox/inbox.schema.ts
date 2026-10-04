import { z } from "zod";

export const RULE_FIELDS = ["FROM_ADDRESS", "FROM_DOMAIN", "SUBJECT", "BODY", "ANY_TEXT"] as const;
export const MATCH_TYPES = ["CONTAINS", "EQUALS", "STARTS_WITH", "ENDS_WITH", "REGEX"] as const;
export const JOB_STATUSES = [
  "APPLIED", "ACKNOWLEDGED", "RECRUITER_REPLY", "INTERVIEW_INVITE",
  "ASSESSMENT", "OFFER", "REJECTION", "WITHDRAWN", "OTHER",
] as const;
export const ASSIGNMENT_SOURCES = ["NONE", "RULE", "AI", "MANUAL"] as const;
export const MESSAGE_STATES = ["ACTIVE", "TRASH_PENDING", "TRASHED"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #60A5FA");

// ---- categories -------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  color: hexColor.optional(),
  trackSubStatus: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const reorderCategoriesSchema = z.object({
  order: z.array(z.number().int().positive()).min(1).max(200),
});

export const deleteCategoryQuerySchema = z.object({
  /** Where this category's mail goes. Omitted means Uncategorized. */
  reassignTo: z.coerce.number().int().positive().optional(),
});

// ---- rules ------------------------------------------------------------------

export const createRuleSchema = z.object({
  field: z.enum(RULE_FIELDS),
  matchType: z.enum(MATCH_TYPES).optional(),
  value: z.string().trim().min(1).max(500),
  priority: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
  subStatus: z.enum(JOB_STATUSES).nullish(),
});

export const updateRuleSchema = createRuleSchema.partial();

export const testRuleSchema = z.object({
  field: z.enum(RULE_FIELDS),
  matchType: z.enum(MATCH_TYPES).optional(),
  value: z.string().trim().min(1).max(500),
});

// ---- messages ---------------------------------------------------------------

export const listMessagesQuerySchema = z.object({
  /** A numeric id, or the literal "uncategorized". Omitted means every category. */
  categoryId: z.union([z.coerce.number().int().positive(), z.literal("uncategorized")]).optional(),
  state: z.enum(MESSAGE_STATES).optional().default("ACTIVE"),
  search: z.string().trim().max(200).optional(),
  source: z.enum(ASSIGNMENT_SOURCES).optional(),
  jobStatus: z.enum(JOB_STATUSES).optional(),
  unread: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const setCategorySchema = z.object({
  categoryId: z.number().int().positive().nullable(),
  jobStatus: z.enum(JOB_STATUSES).nullish(),
});

export const bulkSetCategorySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  categoryId: z.number().int().positive().nullable(),
  jobStatus: z.enum(JOB_STATUSES).nullish(),
});

export const setReadSchema = z.object({
  isUnread: z.boolean(),
});

export const deleteMessagesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

// ---- jobs / sync ------------------------------------------------------------

export const classifyBodySchema = z
  .object({
    /** "new" = only unsorted mail. "all" = re-run everything except manual picks. */
    mode: z.enum(["new", "all"]).optional().default("new"),
  })
  .optional()
  .default({ mode: "new" });

export const updateSyncStateSchema = z.object({
  enabled: z.boolean(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type TestRuleInput = z.infer<typeof testRuleSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SetCategoryInput = z.infer<typeof setCategorySchema>;
export type BulkSetCategoryInput = z.infer<typeof bulkSetCategorySchema>;
export type DeleteMessagesInput = z.infer<typeof deleteMessagesSchema>;
export type ClassifyBody = z.infer<typeof classifyBodySchema>;
