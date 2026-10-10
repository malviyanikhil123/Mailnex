-- =============================================================================
-- Agent "templates" (generic starter templates + HTML designs) — SQL for the next
-- migration.
--
-- The drizzle schema already reflects the DDL below (backend/src/db/schema/templates.ts:
-- new column email_templates.format), so `drizzle-kit generate` should emit the
-- equivalent ADD COLUMN. Every statement here is safe to re-run on a live database.
-- =============================================================================

-- ---- DDL (expected from drizzle-kit generate) --------------------------------

-- 'text' = plain text, formatted into simple HTML when sent (the only kind so far);
-- 'html' = a sanitized HTML design. Allowed values are validated in code (zod enum),
-- not by a CHECK constraint, matching how other text "enums" are stored here.
-- Adding a column with a constant default is a metadata-only change on PG 11+ (no table
-- rewrite), so it is safe on a live table.
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "format" text DEFAULT 'text' NOT NULL;

-- ---- DATA BACKFILL -------------------------------------------------------------
--
-- NONE. Every existing template is plain text, which the column default already says.
--
-- Existing users keep their templates exactly as they are: the new generic starter set
-- (backend/src/db/seed/templates.ts) is only inserted for new registrations, or when a
-- user clicks "Add starter templates" on the Templates page (POST /templates/starter,
-- which inserts only the (name, category) pairs the user does not have yet, with
-- ON CONFLICT DO NOTHING on email_templates_name_category_user_unique).
--
-- email_templates.active is KEPT (do not drop it): nothing reads it any more (campaigns
-- pick their templates through campaign_templates), and the Templates page no longer
-- shows it. It can be dropped in a later migration if wanted.
--
-- If drizzle-kit proposes anything else for email_templates (renaming resume_id, dropping
-- active, touching the unique index), do not apply that part.
