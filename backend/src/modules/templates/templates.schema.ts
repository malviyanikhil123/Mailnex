import { z } from "zod";
import { LIMITS } from "../../config/constants.js";

export const TEMPLATE_FORMATS = ["text", "html"] as const;
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];

const MAX_KB = LIMITS.TEMPLATE_BODY_MAX_BYTES / 1024;

const body = z
  .string()
  .min(1)
  .refine((b) => Buffer.byteLength(b, "utf8") <= LIMITS.TEMPLATE_BODY_MAX_BYTES, {
    message: `The email body is limited to ${MAX_KB} KB`,
  });

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body,
  format: z.enum(TEMPLATE_FORMATS).optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
  documentId: z.number().int().optional().nullable(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: body.optional(),
  format: z.enum(TEMPLATE_FORMATS).optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
  documentId: z.number().int().optional().nullable(),
});

export const previewVarsSchema = z.record(z.string(), z.string()).optional().default({});

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** POST /templates/generate-html — describe an email design for the AI to build. */
export const generateHtmlSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Describe the email in at least 10 characters")
    .max(2000, "Keep the description under 2000 characters"),
  tone: z.string().trim().max(60).optional(),
  brandColor: z
    .string()
    .trim()
    .regex(HEX_COLOR, "Brand color must be a hex color like #2563eb")
    .optional()
    .or(z.literal("")),
  includeVariables: z.boolean().optional().default(true),
  provider: z.string().max(40).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type PreviewVars = z.infer<typeof previewVarsSchema>;
export type GenerateHtmlInput = z.infer<typeof generateHtmlSchema>;
