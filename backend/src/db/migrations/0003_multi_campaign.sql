CREATE TABLE IF NOT EXISTS "campaign_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"template_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"import_id" integer,
	"sender_account_id" integer,
	"mode" "campaign_mode" DEFAULT 'DRAFT' NOT NULL,
	"state" "campaign_state" DEFAULT 'IDLE' NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"start_hour" integer DEFAULT 9 NOT NULL,
	"end_hour" integer DEFAULT 18 NOT NULL,
	"test_email" text,
	"language" text DEFAULT 'English' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sender_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"email" text NOT NULL,
	"app_password_enc" text NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovered_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"job_id" integer,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"name" text,
	"company_name" text,
	"company_domain" text,
	"company_type" text,
	"industry" text,
	"location" text,
	"email_category" text DEFAULT 'General' NOT NULL,
	"classification_confidence" real DEFAULT 0.5 NOT NULL,
	"source_url" text,
	"is_valid" boolean DEFAULT true NOT NULL,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"imported_contact_id" integer,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovery_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"location" text,
	"profession" text,
	"keywords" text,
	"company_type" text,
	"target_count" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"companies_found" integer DEFAULT 0 NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"emails_found" integer DEFAULT 0 NOT NULL,
	"hr_emails_found" integer DEFAULT 0 NOT NULL,
	"duplicates_removed" integer DEFAULT 0 NOT NULL,
	"current_domain" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN IF NOT EXISTS "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "import_id" integer;--> statement-breakpoint
ALTER TABLE "contacts_imports" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "sender_daily_limit" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_import_id_contacts_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."contacts_imports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_account_id_sender_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_fields" ADD CONSTRAINT "profile_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_job_id_discovery_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."discovery_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_imported_contact_id_contacts_id_fk" FOREIGN KEY ("imported_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovery_jobs" ADD CONSTRAINT "discovery_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_templates_campaign_template_unique" ON "campaign_templates" USING btree ("campaign_id","template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_user_id_idx" ON "campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_state_idx" ON "campaigns" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sender_accounts_email_user_unique" ON "sender_accounts" USING btree ("email","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_fields_key_user_unique" ON "profile_fields" USING btree ("key","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_user_normalized_email_idx" ON "discovered_leads" USING btree ("user_id","normalized_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_job_id_idx" ON "discovered_leads" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_user_category_idx" ON "discovered_leads" USING btree ("user_id","email_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_created_at_idx" ON "discovered_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_user_id_idx" ON "discovery_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_status_idx" ON "discovery_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_created_at_idx" ON "discovery_jobs" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_import_id_contacts_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."contacts_imports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_queue_campaign_status_idx" ON "campaign_queue" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_import_id_idx" ON "contacts" USING btree ("import_id");--> statement-breakpoint
-- Backfill: contacts imported before imports were tracked go into one "Legacy contacts" import per user.
INSERT INTO "contacts_imports" ("user_id", "name", "file_name", "total_rows", "imported_rows")
SELECT c."user_id", 'Legacy contacts', 'legacy', count(*), count(*)
FROM "contacts" c
WHERE c."import_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "contacts_imports" i WHERE i."user_id" = c."user_id" AND i."file_name" = 'legacy')
GROUP BY c."user_id";--> statement-breakpoint
UPDATE "contacts" c SET "import_id" = i."id"
FROM "contacts_imports" i
WHERE c."import_id" IS NULL AND i."user_id" = c."user_id" AND i."file_name" = 'legacy';--> statement-breakpoint
-- Backfill: each user's old single campaign becomes a "Default campaign" over the legacy import,
-- keeping its mode/state/limits so sending carries on unchanged once this code is deployed.
INSERT INTO "campaigns" ("user_id", "name", "import_id", "mode", "state", "daily_limit", "start_hour", "end_hour", "test_email")
SELECT s."user_id", 'Default campaign',
       (SELECT i."id" FROM "contacts_imports" i WHERE i."user_id" = s."user_id" AND i."file_name" = 'legacy' LIMIT 1),
       s."mode", s."state", s."daily_limit", s."start_hour", s."end_hour", s."test_email"
FROM "campaign_settings" s
WHERE NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."user_id" = s."user_id");--> statement-breakpoint
-- The old campaign rotated through the user's active templates; the default campaign does the same.
INSERT INTO "campaign_templates" ("campaign_id", "template_id")
SELECT c."id", t."id"
FROM "campaigns" c
JOIN "email_templates" t ON t."user_id" = c."user_id" AND t."active" = true
WHERE c."name" = 'Default campaign'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "campaign_queue" q SET "campaign_id" = c."id"
FROM "campaigns" c
WHERE q."campaign_id" IS NULL AND c."user_id" = q."user_id" AND c."name" = 'Default campaign';--> statement-breakpoint
UPDATE "email_logs" l SET "campaign_id" = c."id"
FROM "campaigns" c
WHERE l."campaign_id" IS NULL AND c."user_id" = l."user_id" AND c."name" = 'Default campaign';
