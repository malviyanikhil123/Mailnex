import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
  active: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
});

export const previewVarsSchema = z.record(z.string(), z.string()).optional().default({});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type PreviewVars = z.infer<typeof previewVarsSchema>;
