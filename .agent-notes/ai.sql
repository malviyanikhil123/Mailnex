-- =============================================================================
-- Agent "ai" — SQL for the next migration (multi-provider AI keys).
--
-- The drizzle schema already reflects the DDL below:
--   backend/src/db/schema/ai.ts        (new table ai_provider_keys)
--   backend/src/db/schema/campaign.ts  (campaigns.ai_provider, campaigns.ai_model)
-- so `drizzle-kit generate` should emit equivalent DDL. Compare it with this file,
-- then append the DATA BACKFILL section by hand (drizzle-kit does not generate it).
-- =============================================================================

-- ---- DDL (expected from drizzle-kit generate) --------------------------------

CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,            -- 'openai' | 'anthropic' | 'google' | 'groq' (validated in code)
	"api_key_enc" text NOT NULL,         -- AES-GCM ciphertext from backend/src/utils/crypto.ts
	"default_model" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,  -- at most one true per user, enforced by the service
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ai_provider" text;   -- null = the user's default provider
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ai_model" text;      -- null = that provider's saved default model
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_provider_keys_user_provider_unique" ON "ai_provider_keys" USING btree ("user_id","provider");
--> statement-breakpoint

-- ---- DATA BACKFILL (hand-written; append after the DDL) ----------------------
-- Every existing Gemini key becomes the user's Google provider key and default.
-- The ciphertext is copied as-is: both columns use the same utils/crypto format
-- and ENCRYPTION_KEY, so no re-encryption is needed.
-- 'gemini-3.5-flash-lite' is the first model the Gemini-only code tried
-- (integrations/gemini/model-factory.ts CANDIDATE_MODELS[0]) and is also Google's
-- default in integrations/ai/providers.ts.
-- Only users with no ai_provider_keys row at all are backfilled, so every backfilled
-- row is the user's only one and is_default = true keeps "one default per user" —
-- even if this statement is re-run after users have started adding keys (a re-run
-- must not add a second default next to a provider the user picked since).
INSERT INTO "ai_provider_keys" ("user_id", "provider", "api_key_enc", "default_model", "is_default", "created_at", "updated_at")
SELECT s."user_id", 'google', s."gemini_api_key_enc", 'gemini-3.5-flash-lite', true, now(), now()
FROM "app_settings" s
WHERE s."gemini_api_key_enc" IS NOT NULL AND s."gemini_api_key_enc" <> ''
  AND NOT EXISTS (SELECT 1 FROM "ai_provider_keys" k WHERE k."user_id" = s."user_id")
ON CONFLICT ("user_id", "provider") DO NOTHING;

-- Existing campaigns keep ai_provider / ai_model NULL, i.e. they use the user's
-- default provider — Google for everyone backfilled above, same as before.

-- Do NOT drop app_settings.gemini_api_key_enc in this migration: it is kept for
-- rollback safety. The code no longer reads or writes it (PATCH /settings/gemini is
-- gone), so it can be dropped in a later migration once this release is settled.
