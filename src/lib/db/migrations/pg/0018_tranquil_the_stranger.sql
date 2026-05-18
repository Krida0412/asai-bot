CREATE TABLE "chief_brief_ledger" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ledger" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chief_confirmation_idempotency" (
	"confirmation_id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"enqueued_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_outputs" ALTER COLUMN "stage_name" SET DATA TYPE varchar(100);--> statement-breakpoint
CREATE INDEX "chief_confirmation_idempotency_user_id_idx" ON "chief_confirmation_idempotency" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chief_confirmation_idempotency_thread_id_idx" ON "chief_confirmation_idempotency" USING btree ("thread_id");