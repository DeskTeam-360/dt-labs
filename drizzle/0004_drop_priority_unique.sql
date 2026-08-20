ALTER TABLE "ticket_comments" ALTER COLUMN "fd_conversation_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "source" varchar(32);--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_fd_conversation_id_unique" UNIQUE("fd_conversation_id");--> statement-breakpoint
DROP INDEX IF EXISTS "tickets_support_company_priority_unique";