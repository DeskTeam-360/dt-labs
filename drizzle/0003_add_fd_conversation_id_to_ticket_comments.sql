CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) DEFAULT 'Default' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"provider" varchar(32) DEFAULT 'openai' NOT NULL,
	"openai_api_key" text,
	"openai_base_url" text,
	"openai_model" varchar(128),
	"codex_api_key" text,
	"codex_base_url" text,
	"codex_model" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_template_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "checklist_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"group_id" uuid,
	"title" text NOT NULL,
	"note" text,
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_ticket_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_ticket_id" uuid NOT NULL,
	"ticket_id" integer,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(16) DEFAULT 'success' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "recurring_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"frequency" varchar(32) DEFAULT 'daily' NOT NULL,
	"specific_days" jsonb,
	"specific_date" integer,
	"interval_days" integer,
	"time_of_day" varchar(5) DEFAULT '08:00' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"ticket_status" varchar(128),
	"ticket_priority" integer DEFAULT 0,
	"team_id" uuid,
	"company_id" uuid,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb,
	"ticket_type_id" integer,
	"contact_user_id" uuid,
	"visibility" varchar(32) DEFAULT 'team' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "freshdesk_id" bigint;--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "email_subject" text;--> statement-breakpoint
ALTER TABLE "ticket_checklist" ADD COLUMN "group_name" text;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD COLUMN "fd_conversation_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "original_description" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "customer_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "staff_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "checklist_template_groups" ADD CONSTRAINT "checklist_template_groups_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_group_id_checklist_template_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."checklist_template_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_ticket_runs" ADD CONSTRAINT "recurring_ticket_runs_recurring_ticket_id_recurring_tickets_id_fk" FOREIGN KEY ("recurring_ticket_id") REFERENCES "public"."recurring_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_ticket_runs_rule_idx" ON "recurring_ticket_runs" USING btree ("recurring_ticket_id");--> statement-breakpoint
CREATE INDEX "recurring_ticket_runs_ran_at_idx" ON "recurring_ticket_runs" USING btree ("ran_at");