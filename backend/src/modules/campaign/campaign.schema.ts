import { z } from "zod";
import { campaignMode } from "../../db/schema/enums.js";

export const setModeSchema = z.object({
  mode: z.enum(campaignMode.enumValues as [string, ...string[]]),
});
export type SetModeInput = z.infer<typeof setModeSchema>;
