-- =============================================================================
-- Agent "profile" (Documents + generic My Profile) — notes for migration 0004.
-- =============================================================================
--
-- EXPECTED DDL FROM `drizzle-kit generate`: NONE from this branch.
--   * db/schema/resumes.ts became db/schema/documents.ts and the TS export is now
--     `documents`, but the table is still pgTable("resumes", ...).
--   * email_templates.resume_id keeps its column name (TS property is now `documentId`);
--     the FK email_templates_resume_id_resumes_id_fk (ON DELETE SET NULL) is unchanged.
--   * app_settings.candidate_profile and app_settings.resume_path are unchanged.
--   If drizzle-kit proposes renaming or dropping any of these, do not apply that part.
--
-- DATA BACKFILL (paste below the generated DDL; every statement is safe to re-run).
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
