import { z } from "zod";
import { campaignMode } from "../../db/schema/enums.js";
import { AI_PROVIDERS, MODEL_ID_PATTERN } from "../../integrations/ai/providers.js";

const campaignFields = z.object({
  name: z.string().trim().min(1).max(120),
  /** Contacts import the campaign sends to. */
  importId: z.number().int().positive().nullable(),
  /** Sender account; null = the primary Gmail from Settings. */
  senderAccountId: z.number().int().positive().nullable(),
  /** Templates the campaign rotates through. */
  templateIds: z.array(z.number().int().positive()).max(50),
  mode: z.enum(campaignMode.enumValues as [string, ...string[]]),
  dailyLimit: z.number().int().min(1).max(2000),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  testEmail: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
  language: z.string().trim().min(1).max(40),
  aiEnabled: z.boolean(),
  aiInstructions: z.string().trim().max(2000).nullable(),
  /** AI provider for personalization; null = the user's default provider. */
  aiProvider: z.enum(AI_PROVIDERS).nullable(),
  /** Model of that provider; null = the provider's saved model. Needs aiProvider. */
  aiModel: z.string().trim().regex(MODEL_ID_PATTERN, "Invalid model id").nullable(),
});

const windowIsValid = (v: { startHour?: number; endHour?: number }) =>
  v.startHour === undefined || v.endHour === undefined || v.startHour < v.endHour;
const windowError = { message: "startHour must be less than endHour", path: ["endHour"] };

export const createCampaignSchema = campaignFields
  .extend({
    importId: campaignFields.shape.importId.default(null),
    senderAccountId: campaignFields.shape.senderAccountId.default(null),
    templateIds: campaignFields.shape.templateIds.default([]),
    mode: campaignFields.shape.mode.default("DRAFT"),
    dailyLimit: campaignFields.shape.dailyLimit.default(50),
    startHour: campaignFields.shape.startHour.default(9),
    endHour: campaignFields.shape.endHour.default(18),
    testEmail: campaignFields.shape.testEmail.default(null),
    language: campaignFields.shape.language.default("English"),
    aiEnabled: campaignFields.shape.aiEnabled.default(true),
    aiInstructions: campaignFields.shape.aiInstructions.default(null),
    aiProvider: campaignFields.shape.aiProvider.default(null),
    aiModel: campaignFields.shape.aiModel.default(null),
  })
  .refine(windowIsValid, windowError);
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = campaignFields.partial().refine(windowIsValid, windowError);
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
