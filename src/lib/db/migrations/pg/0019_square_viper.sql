ALTER TABLE "chief_confirmation_idempotency" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chief_confirmation_idempotency" ADD COLUMN "failure_status" text;--> statement-breakpoint
ALTER TABLE "chief_confirmation_idempotency" ADD COLUMN "failure_message" text;