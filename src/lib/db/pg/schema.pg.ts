import { Agent } from "app-types/agent";
import { UserPreferences } from "app-types/user";
import { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import type {
  BriefLedger,
  PendingConfirmation,
} from "@/lib/agen-team/chief/schemas";
import type {
  AgentAgencyDecision,
  ContentCalendarItem,
  GrowthApprovalPolicy,
  GrowthReview,
  GrowthSprintBrief,
  GrowthSprintStatus,
  GrowthStrategy,
  PerformanceSnapshot,
} from "@/lib/agen-team/growth/schemas";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  json,
  jsonb,
  uuid,
  boolean,
  unique,
  varchar,
  index,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { isNotNull } from "drizzle-orm";
import { DBWorkflow, DBEdge, DBNode } from "app-types/workflow";
import { UIMessage } from "ai";
import { ChatMetadata } from "app-types/chat";
import { TipTapMentionJsonContent } from "@/types/util";

export type DifyConfig = {
  apiKey: string;
  datasetId: string;
  enabled: boolean;
};

export const ChatThreadTable = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // Hybrid Memory System fields
  latest_summary: text("latest_summary"),
  summary_message_count: integer("summary_message_count").default(0),
  dify_config: json("dify_config").$type<DifyConfig>(),
  auto_summarize: boolean("auto_summarize").default(false),
});

export const ChatMessageTable = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<UIMessage["role"]>(),
  parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AgentTable = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const BookmarkTable = pgTable(
  "bookmark",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    itemType: varchar("item_type", {
      enum: ["agent", "workflow", "mcp"],
    }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.itemId, table.itemType),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_item_idx").on(table.itemId, table.itemType),
  ],
);

export const McpServerTable = pgTable("mcp_server", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  config: json("config").notNull().$type<MCPServerConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", {
    enum: ["public", "private"],
  })
    .notNull()
    .default("private"),
  toolInfo: json("tool_info").$type<MCPToolInfo[]>(),
  toolInfoUpdatedAt: timestamp("tool_info_updated_at"),
  lastConnectionStatus: varchar("last_connection_status", {
    enum: ["connected", "error"],
  }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserTable = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  role: text("role").notNull().default("user"),
});

// Role tables removed - using Better Auth's built-in role system
// Roles are now managed via the 'role' field on UserTable

export const SessionTable = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // Admin plugin field (from better-auth generated schema)
  impersonatedBy: text("impersonated_by"),
});

export const AccountTable = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const VerificationTable = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

// Tool customization table for per-user additional instructions
export const McpToolCustomizationTable = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationTable = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

export const WorkflowTable = pgTable("workflow", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  name: text("name").notNull(),
  icon: json("icon").$type<DBWorkflow["icon"]>(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const WorkflowNodeDataTable = pgTable(
  "workflow_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    version: text("version").notNull().default("0.1.0"),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => WorkflowTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    uiConfig: json("ui_config").$type<DBNode["uiConfig"]>().default({}),
    nodeConfig: json("node_config")
      .$type<Partial<DBNode["nodeConfig"]>>()
      .default({}),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("workflow_node_kind_idx").on(t.kind)],
);

export const WorkflowEdgeTable = pgTable("workflow_edge", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => WorkflowTable.id, { onDelete: "cascade" }),
  source: uuid("source")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  target: uuid("target")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  uiConfig: json("ui_config").$type<DBEdge["uiConfig"]>().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveTable = pgTable("archive", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveItemTable = pgTable(
  "archive_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => ArchiveTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("archive_item_item_id_idx").on(t.itemId)],
);

export const McpOAuthSessionTable = pgTable(
  "mcp_oauth_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    clientInfo: json("client_info"),
    tokens: json("tokens"),
    codeVerifier: text("code_verifier"),
    state: text("state").unique(), // OAuth state parameter for current flow (unique for security)
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("mcp_oauth_session_server_id_idx").on(t.mcpServerId),
    index("mcp_oauth_session_state_idx").on(t.state),
    // Partial index for sessions with tokens for better performance
    index("mcp_oauth_session_tokens_idx")
      .on(t.mcpServerId)
      .where(isNotNull(t.tokens)),
  ],
);

export type McpServerEntity = typeof McpServerTable.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadTable.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageTable.$inferSelect;

export type AgentEntity = typeof AgentTable.$inferSelect;
export type UserEntity = typeof UserTable.$inferSelect;
export type SessionEntity = typeof SessionTable.$inferSelect;

export type ToolCustomizationEntity =
  typeof McpToolCustomizationTable.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationTable.$inferSelect;

export const ChatExportTable = pgTable("chat_export", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  exporterId: uuid("exporter_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  originalThreadId: uuid("original_thread_id"),
  messages: json("messages").notNull().$type<
    Array<{
      id: string;
      role: UIMessage["role"];
      parts: UIMessage["parts"];
      metadata?: ChatMetadata;
    }>
  >(),
  exportedAt: timestamp("exported_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
});

export const ChatExportCommentTable = pgTable("chat_export_comment", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  exportId: uuid("export_id")
    .notNull()
    .references(() => ChatExportTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => ChatExportCommentTable.id, {
    onDelete: "cascade",
  }),
  content: json("content").notNull().$type<TipTapMentionJsonContent>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ArchiveEntity = typeof ArchiveTable.$inferSelect;
export type ArchiveItemEntity = typeof ArchiveItemTable.$inferSelect;
export type BookmarkEntity = typeof BookmarkTable.$inferSelect;

// ─── Hybrid Memory System ────────────────────────────────────────────────────

export const UserMemoryTable = pgTable("user_memory", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: text("user_id").notNull(),
  threadId: text("thread_id"), // nullable — some facts are global
  fact_content: text("fact_content").notNull(),
  // values: "thesis" | "personal" | "academic" | "preference" | "other"
  category: text("category").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type UserMemoryEntity = typeof UserMemoryTable.$inferSelect;


export const ChiefConversationMemoryTable = pgTable(
  "chief_conversation_memory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    condensedSummary: text("condensed_summary"),
    extractedPreferences: jsonb("extracted_preferences"),
    lastContextUpdated: timestamp("last_context_updated")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const ChiefConversationHistoryTable = pgTable(
  "chief_conversation_history",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    state: varchar("state", { length: 50 }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("chief_history_user_id_idx").on(t.userId)],
);

export const UserIntegrationTable = pgTable(
  "user_integrations",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("disconnected"),
    accessTokenEncrypted: text("access_token_encrypted"),
    accountName: text("account_name"),
    accountId: text("account_id"),
    meta: jsonb("meta"),
    connectedAt: timestamp("connected_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique().on(t.userId, t.platform)],
);

// ─── Agent Team System ───────────────────────────────────────────────────────

export const AgentTaskTable = pgTable(
  "agent_tasks",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    intentType: varchar("intent_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    inputPayload: jsonb("input_payload").notNull(),
    isScheduled: boolean("is_scheduled").notNull().default(false),
    scheduledTime: timestamp("scheduled_time"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("agent_tasks_user_id_idx").on(t.userId)],
);

export const TaskOutputTable = pgTable(
  "task_outputs",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => AgentTaskTable.id, { onDelete: "cascade" }),
    stageName: varchar("stage_name", { length: 100 }).notNull(),
    content: jsonb("content").notNull(),
    tokenUsageInput: integer("token_usage_input").notNull().default(0),
    tokenUsageOutput: integer("token_usage_output").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("task_outputs_task_id_idx").on(t.taskId)],
);

export const TaskMediaAssetTable = pgTable(
  "task_media_assets",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => AgentTaskTable.id, { onDelete: "cascade" }),
    assetId: varchar("asset_id", { length: 100 }).notNull(),
    originalUrl: text("original_url").notNull(),
    localPath: text("local_path"),
    fallbackUrl: text("fallback_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("task_media_task_id_idx").on(t.taskId)],
);

export const CostTrackingTable = pgTable(
  "cost_tracking",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => AgentTaskTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    service: varchar("service", { length: 50 }).notNull(),
    model: varchar("model", { length: 50 }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("cost_tracking_task_id_idx").on(t.taskId),
    index("cost_tracking_user_id_idx").on(t.userId),
  ],
);

// Agen Team entity types
export type AgentTaskEntity = typeof AgentTaskTable.$inferSelect;
export type TaskOutputEntity = typeof TaskOutputTable.$inferSelect;
export type TaskMediaAssetEntity = typeof TaskMediaAssetTable.$inferSelect;
export type CostTrackingEntity = typeof CostTrackingTable.$inferSelect;
export type ChiefConversationMemoryEntity =
  typeof ChiefConversationMemoryTable.$inferSelect;
export type ChiefConversationHistoryEntity =
  typeof ChiefConversationHistoryTable.$inferSelect;
export type UserIntegrationEntity = typeof UserIntegrationTable.$inferSelect;

// ─── Chief Chat v3 — Brief Ledger & Confirmation Idempotency ────────────────

export const ChiefBriefLedgerTable = pgTable("chief_brief_ledger", {
  threadId: text("thread_id").primaryKey(),
  userId: text("user_id").notNull(),
  ledger: jsonb("ledger").$type<BriefLedger>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const ChiefConfirmationIdempotencyTable = pgTable(
  "chief_confirmation_idempotency",
  {
    confirmationId: text("confirmation_id").primaryKey(),
    // taskId equals confirmationId; enforced in code (Requirement 6.2)
    taskId: text("task_id").notNull(),
    userId: text("user_id").notNull(),
    threadId: text("thread_id").notNull(),
    snapshot: jsonb("snapshot").$type<PendingConfirmation>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
    // v3 task 8.4 — non-retryable enqueue failure surface (Requirement 13.6).
    // Either both `failedAt` and `failureStatus` are populated together, or
    // neither is. The Inngest handler (`chiefExecuteConfirmation`) writes
    // these fields atomically via `markConfirmationFailed` after a
    // non-retryable error or a `rate_limited` enqueue result. The
    // `confirmation-status` endpoint and the next chief-chat dispatch read
    // them to surface a `createAgenTeamTask` tool output with
    // `readyForStory: false` and `status: "error" | "rate_limited"`.
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureStatus: text("failure_status"),
    failureMessage: text("failure_message"),
  },
  (t) => [
    index("chief_confirmation_idempotency_user_id_idx").on(t.userId),
    index("chief_confirmation_idempotency_thread_id_idx").on(t.threadId),
  ],
);

export type ChiefBriefLedgerEntity = typeof ChiefBriefLedgerTable.$inferSelect;
export type ChiefConfirmationIdempotencyEntity =
  typeof ChiefConfirmationIdempotencyTable.$inferSelect;

// ─── Autonomous Instagram Growth Agency ────────────────────────────────────

export const GrowthSprintTable = pgTable(
  "growth_sprints",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    status: varchar("status", { length: 40 })
      .$type<GrowthSprintStatus>()
      .notNull()
      .default("draft"),
    approvalPolicy: varchar("approval_policy", { length: 60 })
      .$type<GrowthApprovalPolicy>()
      .notNull()
      .default("strategy_approved_auto_publish"),
    brief: jsonb("brief").$type<GrowthSprintBrief>().notNull(),
    strategy: jsonb("strategy").$type<GrowthStrategy>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("growth_sprints_user_id_idx").on(t.userId),
    index("growth_sprints_status_idx").on(t.status),
  ],
);

export const GrowthSprintCalendarItemTable = pgTable(
  "growth_sprint_calendar_items",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => GrowthSprintTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("draft"),
    content: jsonb("content").$type<ContentCalendarItem>().notNull(),
    publishResult: jsonb("publish_result"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("growth_calendar_sprint_id_idx").on(t.sprintId),
    index("growth_calendar_user_id_idx").on(t.userId),
    index("growth_calendar_scheduled_for_idx").on(t.scheduledFor),
  ],
);

export const GrowthSprintPostTable = pgTable(
  "growth_sprint_posts",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => GrowthSprintTable.id, { onDelete: "cascade" }),
    calendarItemId: uuid("calendar_item_id").references(
      () => GrowthSprintCalendarItemTable.id,
      { onDelete: "set null" },
    ),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    caption: text("caption").notNull(),
    imageUrl: text("image_url"),
    status: varchar("status", { length: 40 }).notNull().default("draft"),
    publishResult: jsonb("publish_result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("growth_posts_sprint_id_idx").on(t.sprintId),
    index("growth_posts_user_id_idx").on(t.userId),
  ],
);

export const GrowthExperimentTable = pgTable(
  "growth_experiments",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => GrowthSprintTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hypothesis: text("hypothesis").notNull(),
    status: varchar("status", { length: 40 }).notNull().default("planned"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("growth_experiments_sprint_id_idx").on(t.sprintId)],
);

export const GrowthReviewTable = pgTable(
  "growth_reviews",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => GrowthSprintTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    weekIndex: integer("week_index").notNull(),
    performanceSnapshot: jsonb("performance_snapshot").$type<
      PerformanceSnapshot
    >(),
    review: jsonb("review").$type<GrowthReview>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("growth_reviews_sprint_id_idx").on(t.sprintId)],
);

export const BrandMemoryTable = pgTable(
  "brand_memory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    brandName: text("brand_name").notNull(),
    memory: jsonb("memory").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("brand_memory_user_id_idx").on(t.userId),
    unique().on(t.userId, t.brandName),
  ],
);

export const AgentAgencyDecisionTable = pgTable(
  "agent_agency_decisions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => GrowthSprintTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    decision: jsonb("decision").$type<AgentAgencyDecision>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("agency_decisions_sprint_id_idx").on(t.sprintId)],
);

export type GrowthSprintEntity = typeof GrowthSprintTable.$inferSelect;
export type GrowthSprintCalendarItemEntity =
  typeof GrowthSprintCalendarItemTable.$inferSelect;
export type GrowthSprintPostEntity = typeof GrowthSprintPostTable.$inferSelect;
export type GrowthExperimentEntity = typeof GrowthExperimentTable.$inferSelect;
export type GrowthReviewEntity = typeof GrowthReviewTable.$inferSelect;
export type BrandMemoryEntity = typeof BrandMemoryTable.$inferSelect;
export type AgentAgencyDecisionEntity =
  typeof AgentAgencyDecisionTable.$inferSelect;
