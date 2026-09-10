CREATE TABLE IF NOT EXISTS "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_email_unique";--> statement-breakpoint
ALTER TABLE "daily_quota" DROP CONSTRAINT IF EXISTS "daily_quota_date_unique";--> statement-breakpoint
ALTER TABLE "campaign_queue" DROP CONSTRAINT IF EXISTS "campaign_queue_contact_id_contacts_id_fk";--> statement-breakpoint
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_contact_id_contacts_id_fk";--> statement-breakpoint
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_template_id_email_templates_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "email_templates_name_category_unique";--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_settings" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "contacts_imports" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "resume_id" integer;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "daily_quota" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "user_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
CREATE INDEX IF NOT EXISTS "discovered_leads_user_normalized_email_idx" ON "discovered_leads" USING btree ("user_id","normalized_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_job_id_idx" ON "discovered_leads" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_user_category_idx" ON "discovered_leads" USING btree ("user_id","email_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_leads_created_at_idx" ON "discovered_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_user_id_idx" ON "discovery_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_status_idx" ON "discovery_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_jobs_created_at_idx" ON "discovery_jobs" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_settings" ADD CONSTRAINT "campaign_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts_imports" ADD CONSTRAINT "contacts_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_quota" ADD CONSTRAINT "daily_quota_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_email_user_id_unique" ON "contacts" USING btree ("email","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_name_category_user_unique" ON "email_templates" USING btree ("name","category","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_quota_date_user_id_unique" ON "daily_quota" USING btree ("date","user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_settings" ADD CONSTRAINT "campaign_settings_user_id_unique" UNIQUE("user_id");
EXCEPTION
 WHEN duplicate_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_unique" UNIQUE("user_id");
EXCEPTION
 WHEN duplicate_table OR duplicate_object THEN null;
END $$;