CREATE TABLE IF NOT EXISTS "growth_sprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "account_id" text,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "approval_policy" varchar(60) DEFAULT 'strategy_approved_auto_publish' NOT NULL,
  "brief" jsonb NOT NULL,
  "strategy" jsonb,
  "started_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "growth_sprints_user_id_idx" ON "growth_sprints" ("user_id");
CREATE INDEX IF NOT EXISTS "growth_sprints_status_idx" ON "growth_sprints" ("status");

CREATE TABLE IF NOT EXISTS "growth_sprint_calendar_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL REFERENCES "growth_sprints"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "scheduled_for" timestamp with time zone NOT NULL,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "content" jsonb NOT NULL,
  "publish_result" jsonb,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "growth_calendar_sprint_id_idx" ON "growth_sprint_calendar_items" ("sprint_id");
CREATE INDEX IF NOT EXISTS "growth_calendar_user_id_idx" ON "growth_sprint_calendar_items" ("user_id");
CREATE INDEX IF NOT EXISTS "growth_calendar_scheduled_for_idx" ON "growth_sprint_calendar_items" ("scheduled_for");

CREATE TABLE IF NOT EXISTS "growth_sprint_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL REFERENCES "growth_sprints"("id") ON DELETE cascade,
  "calendar_item_id" uuid REFERENCES "growth_sprint_calendar_items"("id") ON DELETE set null,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "caption" text NOT NULL,
  "image_url" text,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "publish_result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "growth_posts_sprint_id_idx" ON "growth_sprint_posts" ("sprint_id");
CREATE INDEX IF NOT EXISTS "growth_posts_user_id_idx" ON "growth_sprint_posts" ("user_id");

CREATE TABLE IF NOT EXISTS "growth_experiments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL REFERENCES "growth_sprints"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "hypothesis" text NOT NULL,
  "status" varchar(40) DEFAULT 'planned' NOT NULL,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "growth_experiments_sprint_id_idx" ON "growth_experiments" ("sprint_id");

CREATE TABLE IF NOT EXISTS "growth_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL REFERENCES "growth_sprints"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "week_index" integer NOT NULL,
  "performance_snapshot" jsonb,
  "review" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "growth_reviews_sprint_id_idx" ON "growth_reviews" ("sprint_id");

CREATE TABLE IF NOT EXISTS "brand_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "account_id" text,
  "brand_name" text NOT NULL,
  "memory" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "brand_memory_user_brand_unique" UNIQUE("user_id", "brand_name")
);

CREATE INDEX IF NOT EXISTS "brand_memory_user_id_idx" ON "brand_memory" ("user_id");

CREATE TABLE IF NOT EXISTS "agent_agency_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprint_id" uuid NOT NULL REFERENCES "growth_sprints"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "decision" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agency_decisions_sprint_id_idx" ON "agent_agency_decisions" ("sprint_id");
