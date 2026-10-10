CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"default_model" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"remember_me" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "company_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ai_provider" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ai_model" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "first_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts_imports" ADD COLUMN IF NOT EXISTS "custom_field_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "format" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_provider_keys_user_provider_unique" ON "ai_provider_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint

-- =============================================================================
-- Backfill: existing Gemini keys become the user's default Google AI provider key
-- =============================================================================
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
--> statement-breakpoint

-- =============================================================================
-- Backfill: legacy single resume -> Documents; generic My Profile JSON
-- =============================================================================
-- -----------------------------------------------------------------------------
-- 1) Legacy single resume (app_settings.resume_path) -> a Documents row.
--
-- Before: a template with resume_id NULL (none picked, or its resume was deleted) fell
-- back to attaching the user's legacy resume_path file. That fallback is removed in
-- code: "no document" now means "no attachment" (needed so deleting a document makes
-- its templates stop attaching). To keep existing users' emails unchanged, each legacy
-- file becomes a document named "Resume" (attachment name = the stored file's base
-- name, exactly what was attached before) and that user's templates without a document
-- are pointed at it. resume_path is cleared afterwards so a re-run does nothing.
-- Note: this can leave a user with 11 documents; they only need to delete one before
-- uploading more (the 10-document limit is checked on upload).
-- -----------------------------------------------------------------------------
WITH moved AS (
  INSERT INTO "resumes" ("user_id", "name", "file_name", "file_path")
  SELECT s."user_id", 'Resume', regexp_replace(s."resume_path", '^.*[\\/]', ''), s."resume_path"
  FROM "app_settings" s
  WHERE s."resume_path" IS NOT NULL AND s."resume_path" <> ''
  RETURNING "id", "user_id"
)
UPDATE "email_templates" t
SET "resume_id" = moved."id"
FROM moved
WHERE t."user_id" = moved."user_id" AND t."resume_id" IS NULL;
--> statement-breakpoint
UPDATE "app_settings" SET "resume_path" = NULL WHERE "resume_path" IS NOT NULL;
--> statement-breakpoint


-- -----------------------------------------------------------------------------
-- 2) My Profile JSON (app_settings.candidate_profile, text holding a JSON object).
--
-- New keys: name, company, email, phone, website, linkedin, signature
-- (name/email/phone/linkedin already existed). Old job-seeker keys (role, experience,
-- skills, github, portfolio) are KEPT: legacy template variables still read them.
--
-- a) portfolio -> website when website is missing or empty.
--    (The app also does this on read while "website" is absent, so this only makes it
--    permanent.)
-- b) Keep existing job-seekers' {{signature}} identical: the old default signature
--    listed role/phone/email/LinkedIn/GitHub/Portfolio, the new default only
--    name/company/phone/website. For profiles that hold any job-seeker data and have no
--    "signature" key yet, store the old default text as their signature (they can edit
--    it in Settings -> My Profile). Profiles without job-seeker data get the new default.
--
-- Rows whose JSON is corrupt are skipped (the app already treats them as empty).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  p jsonb;
  lines text[];
BEGIN
  FOR r IN SELECT "id", "candidate_profile" FROM "app_settings" LOOP
    BEGIN
      p := r."candidate_profile"::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(p) <> 'object' THEN
      CONTINUE;
    END IF;

    -- a) portfolio -> website
    IF coalesce(p->>'portfolio', '') <> '' AND coalesce(p->>'website', '') = '' THEN
      p := p || jsonb_build_object('website', p->>'portfolio');
    END IF;

    -- b) freeze the old default signature for job-seeker profiles
    IF NOT (p ? 'signature') AND (
         coalesce(p->>'role', '') <> '' OR coalesce(p->>'experience', '') <> ''
      OR coalesce(p->>'github', '') <> '' OR coalesce(p->>'portfolio', '') <> ''
      OR (p ? 'skills' AND p->'skills' NOT IN ('""'::jsonb, '[]'::jsonb, 'null'::jsonb))
    ) THEN
      lines := ARRAY['Regards,', ''];
      IF coalesce(p->>'name', '') <> '' THEN lines := lines || (p->>'name'); END IF;
      IF coalesce(p->>'role', '') <> '' THEN lines := lines || (p->>'role'); END IF;
      IF coalesce(p->>'phone', '') <> '' THEN lines := lines || ('Phone: ' || (p->>'phone')); END IF;
      IF coalesce(p->>'email', '') <> '' THEN lines := lines || ('Email: ' || (p->>'email')); END IF;
      IF coalesce(p->>'linkedin', '') <> '' THEN lines := lines || ('LinkedIn: ' || (p->>'linkedin')); END IF;
      IF coalesce(p->>'github', '') <> '' THEN lines := lines || ('GitHub: ' || (p->>'github')); END IF;
      IF coalesce(p->>'portfolio', '') <> '' THEN lines := lines || ('Portfolio: ' || (p->>'portfolio')); END IF;
      p := p || jsonb_build_object('signature', array_to_string(lines, E'\n'));
    END IF;

    IF p::text IS DISTINCT FROM r."candidate_profile"::jsonb::text THEN
      UPDATE "app_settings" SET "candidate_profile" = p::text WHERE "id" = r."id";
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- =============================================================================
-- Backfill: split legacy contacts.contact_person into first_name / last_name
-- =============================================================================
-- -----------------------------------------------------------------------------
-- 2. Data backfill: split legacy contacts.contact_person into first_name / last_name
-- -----------------------------------------------------------------------------
-- Mirrors backend/src/utils/person-name.ts (splitFullName):
--   "Ada King Lovelace" -> Ada / King Lovelace     "Lovelace, Ada" -> Ada / Lovelace
--   "Ada Lovelace, PhD" -> Ada / Lovelace          "Dr. Ada Lovelace" -> Ada / Lovelace
--   "Cher"              -> Cher / NULL
--
-- Safe to run:
--   * idempotent: only rows where first_name AND last_name are both NULL are touched;
--   * contact_person itself is left as is (still shown as a fallback name in the UI);
--   * excel imports never wrote contact_person, so this only affects rows created by lead
--     discovery (and any manual data). Lead discovery stores a department label there when
--     it has no person name ("HR", "Careers", ...); those labels are excluded below so they
--     do not turn into a first name.
-- Caveat: any other non-person value in contact_person (e.g. "Hiring Team") would become
-- first_name "Hiring". That only matters for templates using the NEW {{first_name}} /
-- {{full_name}} variables; no existing template uses them. Skip this block if in doubt.
UPDATE "contacts" AS c
SET "first_name" = p.first_name,
    "last_name"  = p.last_name
FROM (
  SELECT
    n.id,
    CASE WHEN n.name ~ '^[^ ,]+, ?[^,]+$'
         THEN btrim(split_part(n.name, ',', 2))
         ELSE split_part(n.plain, ' ', 1)
    END AS first_name,
    CASE WHEN n.name ~ '^[^ ,]+, ?[^,]+$'
         THEN split_part(n.name, ',', 1)
         ELSE nullif(substr(n.plain, length(split_part(n.plain, ' ', 1)) + 2), '')
    END AS last_name
  FROM (
    SELECT
      s.id,
      s.name,
      -- text before the first comma, without a leading title
      regexp_replace(btrim(split_part(s.name, ',', 1)), '^(mr|mrs|ms|miss|mx|dr|prof)\.? ', '', 'i') AS plain
    FROM (
      SELECT "id", regexp_replace(btrim("contact_person"), '\s+', ' ', 'g') AS name
      FROM "contacts"
      WHERE "first_name" IS NULL
        AND "last_name" IS NULL
        AND "contact_person" IS NOT NULL
        AND btrim("contact_person") <> ''
        AND btrim("contact_person") NOT IN
            ('HR', 'Recruitment', 'Careers', 'IT', 'Accounts', 'Finance', 'Sales', 'General', 'Other', 'Unknown')
    ) AS s
  ) AS n
) AS p
WHERE c."id" = p.id
  AND p.first_name <> '';
