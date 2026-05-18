CREATE TABLE IF NOT EXISTS "user_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"fact_content" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "latest_summary" text;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "summary_message_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "dify_config" json;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "auto_summarize" boolean DEFAULT false;