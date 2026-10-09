-- =============================================================================
-- contacts agent: migration notes for generic contacts (requirement 4)
-- Source of truth: backend/src/db/schema/contacts.ts and backend/src/db/schema/imports.ts.
-- drizzle-kit generate should produce DDL equivalent to section 1; written here in the
-- additive / idempotent style of 0003_multi_campaign.sql. Section 2 is a data backfill
-- drizzle cannot generate: append it to the generated migration by hand.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DDL (all additive; no existing data changes)
-- -----------------------------------------------------------------------------

-- Only the email is required now.
ALTER TABLE "contacts" ALTER COLUMN "company_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "website" text;
--> statement-breakpoint
-- Extra spreadsheet columns, e.g. {"industry": "Fintech"}; existing rows get {}.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- Keys of the extra columns an import stored (shown as {{key}} chips in the Imports tab);
-- existing imports get [].
ALTER TABLE "contacts_imports" ADD COLUMN IF NOT EXISTS "custom_field_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

-- Unchanged on purpose: the unique index contacts_email_user_id_unique (email, user_id),
-- contacts_import_id_idx, and the legacy contacts.contact_person column.

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
