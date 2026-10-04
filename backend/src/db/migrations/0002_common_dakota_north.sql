DO $$ BEGIN
 CREATE TYPE "public"."inbox_assignment_source" AS ENUM('NONE', 'RULE', 'AI', 'MANUAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_message_state" AS ENUM('ACTIVE', 'TRASH_PENDING', 'TRASHED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_rule_field" AS ENUM('FROM_ADDRESS', 'FROM_DOMAIN', 'SUBJECT', 'BODY', 'ANY_TEXT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_rule_match" AS ENUM('CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'REGEX');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_sync_status" AS ENUM('IDLE', 'RUNNING', 'SUCCESS', 'ERROR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."job_application_status" AS ENUM('APPLIED', 'ACKNOWLEDGED', 'RECRUITER_REPLY', 'INTERVIEW_INVITE', 'ASSESSMENT', 'OFFER', 'REJECTION', 'WITHDRAWN', 'OTHER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#60A5FA' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"track_sub_status" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_category_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"field" "inbox_rule_field" NOT NULL,
	"match_type" "inbox_rule_match" DEFAULT 'CONTAINS' NOT NULL,
	"value" text NOT NULL,
	"value_normalized" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sub_status" "job_application_status",
	"match_count" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category_id" integer,
	"assignment_source" "inbox_assignment_source" DEFAULT 'NONE' NOT NULL,
	"matched_rule_id" integer,
	"ai_confidence" integer,
	"ai_reason" text,
	"classified_at" timestamp,
	"manual_override" boolean DEFAULT false NOT NULL,
	"job_status" "job_application_status",
	"job_status_source" "inbox_assignment_source",
	"job_company" text,
	"job_role" text,
	"mailbox" text DEFAULT 'INBOX' NOT NULL,
	"uid_validity" text NOT NULL,
	"uid" integer NOT NULL,
	"message_id" text,
	"gmail_thread_id" text,
	"from_name" text,
	"from_address" text NOT NULL,
	"from_domain" text NOT NULL,
	"to_address" text,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"size_bytes" integer,
	"received_at" timestamp NOT NULL,
	"is_unread" boolean DEFAULT false NOT NULL,
	"state" "inbox_message_state" DEFAULT 'ACTIVE' NOT NULL,
	"delete_requested_at" timestamp,
	"deleted_at" timestamp,
	"delete_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mailbox" text DEFAULT 'INBOX' NOT NULL,
	"uid_validity" text,
	"last_seen_uid" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" "inbox_sync_status" DEFAULT 'IDLE' NOT NULL,
	"last_sync_error" text,
	"last_sync_error_code" text,
	"messages_fetched_last" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"initial_sync_done_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_sync_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_categories" ADD CONSTRAINT "inbox_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_category_rules" ADD CONSTRAINT "inbox_category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_category_rules" ADD CONSTRAINT "inbox_category_rules_category_id_inbox_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inbox_categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_category_id_inbox_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inbox_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_matched_rule_id_inbox_category_rules_id_fk" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."inbox_category_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_sync_state" ADD CONSTRAINT "inbox_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_categories_slug_user_unique" ON "inbox_categories" USING btree ("slug","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_category_rules_dedupe_unique" ON "inbox_category_rules" USING btree ("category_id","field","match_type","value_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_category_rules_user_enabled_priority_idx" ON "inbox_category_rules" USING btree ("user_id","enabled","priority");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_messages_user_mailbox_uid_unique" ON "inbox_messages" USING btree ("user_id","mailbox","uid_validity","uid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_messages_user_state_received_idx" ON "inbox_messages" USING btree ("user_id","state","received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_messages_user_category_idx" ON "inbox_messages" USING btree ("user_id","category_id");
