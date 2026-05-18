import { invalidateResponseCachePrefix } from "@/lib/agen-team/response-cache";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AgentTaskTable } from "@/lib/db/pg/schema.pg";
import { inngest } from "@/lib/inngest/client";
import { runAgenTeamTaskLocally } from "@/lib/agen-team/run-task";
import { generateUUID } from "@/lib/utils";
import { and, eq } from "drizzle-orm";
import { isTaskStale } from "@/lib/agen-team/task-lifecycle";

export interface CreateAgenTeamTaskInput {
  intentType: string;
  topic: string;
  brief?: string;
  platform?: string;
  outputFormat?: string;
  requirements?: string[];
  maxSources?: number;
  needsPhoto?: boolean;
}

export interface RunTaskRequestPayload {
  task_id?: string;
  intent_type?: string;
  topic?: string;
  special_focus?: string;
  brief?: string;
  user_memory_context?: string;
  max_total_tokens?: number;
  max_budget_usd?: number;
  max_sources?: number;
  is_scheduled?: boolean;
  scheduled_utc?: string;
  photo_requirements?: {
    needs_photo?: boolean;
    photo_query?: string;
  };
  platform?: string;
  output_format?: string;
  requirements?: string[];
}

export interface AgenTeamTaskPayload {
  task_id: string;
  user_id: string;
  intent_type: string;
  topic: string;
  special_focus?: string;
  user_memory_context?: string;
  needs_photo: boolean;
  photo_query?: string;
  max_total_tokens: number;
  max_budget_usd: number;
  max_sources: number;
  is_scheduled: boolean;
  scheduled_utc?: string;
  platform?: string;
  output_format?: string;
  requirements?: string[];
}

export type CreateTaskStage =
  | "generate_task_id"
  | "map_tool_input"
  | "normalize_payload"
  | "resolve_user_context"
  | "insert_task_db"
  | "trigger_inngest"
  | "return_success";

export type CreateTaskDebugDetails = {
  traceId: string;
  stage: CreateTaskStage;
  errorName: string;
  errorMessage: string;
};

export class AgenTeamTaskCreationError extends Error {
  traceId: string;
  stage: CreateTaskStage;
  input?: CreateAgenTeamTaskInput;
  mappedPayload?: RunTaskRequestPayload;
  normalizedPayload?: AgenTeamTaskPayload;

  constructor(args: {
    traceId: string;
    stage: CreateTaskStage;
    error: unknown;
    input?: CreateAgenTeamTaskInput;
    mappedPayload?: RunTaskRequestPayload;
    normalizedPayload?: AgenTeamTaskPayload;
  }) {
    const error =
      args.error instanceof Error ? args.error : new Error(String(args.error));
    super(error.message);
    this.name = "AgenTeamTaskCreationError";
    this.traceId = args.traceId;
    this.stage = args.stage;
    this.input = args.input;
    this.mappedPayload = args.mappedPayload;
    this.normalizedPayload = args.normalizedPayload;
    Object.defineProperty(this, "cause", {
      value: error,
      enumerable: false,
      configurable: true,
    });
  }
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getErrorDebugDetails(
  traceId: string,
  stage: CreateTaskStage,
  error: unknown,
): CreateTaskDebugDetails {
  return {
    traceId,
    stage,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage:
      error instanceof Error ? error.message : "Unknown task creation error",
  };
}

function logCreateTaskFailure(args: {
  traceId: string;
  stage: CreateTaskStage;
  error: unknown;
  input?: CreateAgenTeamTaskInput;
  mappedPayload?: RunTaskRequestPayload;
  normalizedPayload?: AgenTeamTaskPayload;
}) {
  if (process.env.NODE_ENV === "production") return;

  console.error("[createAgenTeamTask] failed", {
    traceId: args.traceId,
    stage: args.stage,
    input: args.input,
    mappedPayload: args.mappedPayload,
    normalizedPayload: args.normalizedPayload,
    errorName: args.error instanceof Error ? args.error.name : "UnknownError",
    errorMessage:
      args.error instanceof Error
        ? args.error.message
        : "Unknown task creation error",
    stack: args.error instanceof Error ? args.error.stack : undefined,
  });
}

function isInngestConnectionRefused(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const cause = (error as Error & { cause?: unknown }).cause;
  const causeCode =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : "";

  return (
    message.includes("fetch failed") ||
    causeCode === "ECONNREFUSED" ||
    JSON.stringify(cause).includes("ECONNREFUSED")
  );
}

/**
 * Map the Chief tool input to a `RunTaskRequestPayload`.
 *
 * v3 (Task 7.1) adds an optional `confirmationId` argument. When
 * provided, it is used as the canonical `task_id` so the resulting
 * payload is deterministic and idempotent across retries: the
 * Inngest handler can call this function (or the caller can stamp the
 * id directly) and any subsequent enqueue using the same
 * `confirmationId` will resolve to the existing row.
 *
 * @see Requirements 6.1, 6.2, 7.6
 */
export function mapChiefToolInputToRunTaskPayload(
  input: CreateAgenTeamTaskInput,
  confirmationId?: string,
): RunTaskRequestPayload {
  return {
    task_id: confirmationId ?? generateUUID(),
    intent_type: input.intentType,
    topic: input.topic,
    special_focus: input.brief,
    max_total_tokens: 12000,
    max_budget_usd: 0.35,
    max_sources: input.maxSources ?? 8,
    photo_requirements: {
      needs_photo: input.needsPhoto ?? false,
    },
    platform: input.platform,
    output_format: input.outputFormat,
    requirements: input.requirements ?? [],
  };
}

export function normalizeRunTaskPayload(
  userId: string,
  taskPayload: RunTaskRequestPayload,
): AgenTeamTaskPayload {
  const topic = clampText(taskPayload.topic, 500);
  const specialFocus = clampText(
    taskPayload.special_focus ?? taskPayload.brief,
    1000,
  );
  const memoryContext = clampText(taskPayload.user_memory_context, 4000);

  return {
    task_id: taskPayload.task_id ?? generateUUID(),
    user_id: userId,
    intent_type: taskPayload.intent_type ?? "",
    topic,
    special_focus: specialFocus || undefined,
    user_memory_context: memoryContext || undefined,
    needs_photo: taskPayload.photo_requirements?.needs_photo ?? false,
    photo_query: taskPayload.photo_requirements?.photo_query,
    max_total_tokens: clampNumber(
      taskPayload.max_total_tokens,
      1000,
      120000,
      12000,
    ),
    max_budget_usd: clampNumber(taskPayload.max_budget_usd, 0.01, 50, 0.35),
    max_sources: clampNumber(taskPayload.max_sources, 1, 20, 8),
    is_scheduled: taskPayload.is_scheduled ?? false,
    scheduled_utc: taskPayload.scheduled_utc,
    platform: clampText(taskPayload.platform, 50) || undefined,
    output_format: clampText(taskPayload.output_format, 80) || undefined,
    requirements: Array.isArray(taskPayload.requirements)
      ? taskPayload.requirements
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
  };
}

/**
 * Options bag for {@link enqueueAgenTeamTask}.
 *
 * v3 (Task 7.1) replaces the previous positional `traceId` argument
 * with an options object so we can additionally accept an optional
 * `confirmationId`. When `confirmationId` is provided it becomes the
 * canonical `task_id` for the inserted row, making this call
 * idempotent across retries: a second invocation with the same
 * `confirmationId` (and therefore the same `task_id`) will SELECT
 * the existing row inside a transaction and return a reference to
 * the original task without inserting again.
 *
 * Callers must pass `confirmationId` only when the task id is
 * derived from a Chief confirmation snapshot (Requirement 6.1, 6.2).
 * Legacy callers may omit it; in that case a fresh UUID is generated
 * and idempotency is best-effort (the existing flow already keys on
 * `task_id`, but legacy callers do not benefit from the cancellation
 * window guarantees).
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.8, NFR2
 */
export interface EnqueueAgenTeamTaskOptions {
  /**
   * Canonical Chief confirmation id. When provided, this value is
   * used verbatim as `task_id` of the inserted row so concurrent
   * enqueues with the same `confirmationId` resolve to a single
   * winning task (idempotency token).
   */
  confirmationId?: string;
  /** Trace id used for structured logging across stages. */
  traceId?: string;
}

export async function enqueueAgenTeamTask(
  payload: AgenTeamTaskPayload,
  options: EnqueueAgenTeamTaskOptions = {},
): Promise<{
  taskId: string;
  status:
    | "created"
    | "queued"
    | "running"
    | "scheduled"
    | "already_exists"
    | "rate_limited";
}> {
  if (!payload.intent_type || !payload.topic) {
    throw new Error("Missing required fields: intent_type and topic");
  }

  const traceId = options.traceId ?? generateUUID();

  // When `confirmationId` is provided, the caller has already pinned
  // the task_id to the confirmation snapshot. Make sure the payload
  // mirrors it so the DB primary key (`task_id`) and the idempotency
  // token (`confirmationId`) are identical (Requirement 6.1, 6.2).
  if (options.confirmationId && payload.task_id !== options.confirmationId) {
    payload = { ...payload, task_id: options.confirmationId };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[createAgenTeamTask]", traceId, "normalized payload", payload);
  }

  // SELECT-then-INSERT under a transaction with `FOR UPDATE` so two
  // concurrent enqueues for the same `task_id` (= `confirmationId`)
  // resolve to a single inserted row (Requirement 6.3, 6.8). The
  // transaction body is limited to the existence + rate-limit checks
  // and the insert; side effects that are expensive or non-rollbackable
  // (Inngest send, cache invalidation) run after commit.
  type InsertOutcome =
    | { kind: "inserted"; status: "created" | "scheduled" }
    | { kind: "already_exists" }
    | { kind: "rate_limited" };

  let outcome: InsertOutcome;

  try {
    outcome = await db.transaction(async (tx): Promise<InsertOutcome> => {
      const [existing] = await tx
        .select({
          id: AgentTaskTable.id,
        })
        .from(AgentTaskTable)
        .where(eq(AgentTaskTable.id, payload.task_id))
        .limit(1)
        .for("update");

      if (existing) {
        return { kind: "already_exists" };
      }

      const runningTasks = await tx
        .select({
          id: AgentTaskTable.id,
          createdAt: AgentTaskTable.createdAt,
          updatedAt: AgentTaskTable.updatedAt,
        })
        .from(AgentTaskTable)
        .where(
          and(
            eq(AgentTaskTable.userId, payload.user_id),
            eq(AgentTaskTable.status, "running"),
          ),
        );

      const now = new Date();
      const healthyRunningTasks = runningTasks.filter(
        (t) =>
          !isTaskStale({
            status: "running",
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            now,
          }),
      );

      if (healthyRunningTasks.length >= 2) {
        return { kind: "rate_limited" };
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("[createAgenTeamTask]", traceId, "db insert start");
      }

      await tx.insert(AgentTaskTable).values({
        id: payload.task_id,
        userId: payload.user_id,
        intentType: payload.intent_type,
        status: "running",
        inputPayload: payload,
        isScheduled: payload.is_scheduled,
      });

      return {
        kind: "inserted",
        status: payload.is_scheduled ? "scheduled" : "created",
      };
    });
  } catch (error) {
    throw new AgenTeamTaskCreationError({
      traceId,
      stage: "insert_task_db",
      error,
      normalizedPayload: payload,
    });
  }

  if (outcome.kind === "already_exists") {
    return {
      taskId: payload.task_id,
      status: "already_exists",
    };
  }

  if (outcome.kind === "rate_limited") {
    return {
      taskId: payload.task_id,
      status: "rate_limited",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[createAgenTeamTask]",
      traceId,
      "db insert success",
      payload.task_id,
    );
    console.log("[createAgenTeamTask]", traceId, "inngest send start");
  }

  try {
    await inngest.send({
      name: "agen-team/run.task",
      data: { payload, user_id: payload.user_id },
    });
  } catch (error) {
    if (
      process.env.NODE_ENV !== "production" &&
      !payload.is_scheduled &&
      isInngestConnectionRefused(error)
    ) {
      console.warn(
        "[createAgenTeamTask]",
        traceId,
        "inngest unavailable, falling back to local runner",
      );
      void runAgenTeamTaskLocally({
        payload,
        userId: payload.user_id,
      }).catch(async (fallbackError) => {
        await db
          .update(AgentTaskTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(AgentTaskTable.id, payload.task_id))
          .catch(() => {});
        console.error("[createAgenTeamTask] local fallback failed", {
          traceId,
          errorName:
            fallbackError instanceof Error
              ? fallbackError.name
              : "UnknownError",
          errorMessage:
            fallbackError instanceof Error
              ? fallbackError.message
              : "Unknown fallback error",
          stack:
            fallbackError instanceof Error ? fallbackError.stack : undefined,
        });
      });
    } else {
      await db
        .update(AgentTaskTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(AgentTaskTable.id, payload.task_id))
        .catch(() => {});
      throw new AgenTeamTaskCreationError({
        traceId,
        stage: "trigger_inngest",
        error,
        normalizedPayload: payload,
      });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[createAgenTeamTask]", traceId, "inngest send success");
  }

  invalidateResponseCachePrefix(`agen-team:tasks:${payload.user_id}`);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[createAgenTeamTask]",
      traceId,
      "created task",
      payload.task_id,
    );
  }

  return {
    taskId: payload.task_id,
    status: outcome.status,
  };
}

export async function createAgenTeamTaskFromChief(params: {
  userId: string;
  input: CreateAgenTeamTaskInput;
}): Promise<{
  taskId: string;
  status: "created" | "queued" | "running" | "scheduled";
  traceId: string;
}> {
  const traceId = generateUUID();
  let stage: CreateTaskStage = "generate_task_id";
  let mappedPayload: RunTaskRequestPayload | undefined;
  let normalizedPayload: AgenTeamTaskPayload | undefined;

  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("[createAgenTeamTask]", traceId, "input", params.input);
    }

    stage = "map_tool_input";
    mappedPayload = mapChiefToolInputToRunTaskPayload(params.input);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[createAgenTeamTask]",
        traceId,
        "mapped payload",
        mappedPayload,
      );
    }

    stage = "resolve_user_context";
    if (!params.userId) {
      throw new Error("Missing authenticated user context");
    }

    stage = "normalize_payload";
    normalizedPayload = normalizeRunTaskPayload(params.userId, mappedPayload);

    stage = "insert_task_db";
    const result = await enqueueAgenTeamTask(normalizedPayload, { traceId });

    if (result.status === "rate_limited") {
      throw new Error("Too many running tasks. Limit is 2 per user.");
    }

    stage = "return_success";
    if (result.status === "already_exists") {
      return {
        taskId: result.taskId,
        status: "running",
        traceId,
      };
    }

    return {
      taskId: result.taskId,
      status: result.status === "scheduled" ? "scheduled" : "created",
      traceId,
    };
  } catch (error) {
    if (error instanceof AgenTeamTaskCreationError) {
      throw error;
    }

    logCreateTaskFailure({
      traceId,
      stage,
      error,
      input: params.input,
      mappedPayload,
      normalizedPayload,
    });

    throw new AgenTeamTaskCreationError({
      traceId,
      stage,
      error,
      input: params.input,
      mappedPayload,
      normalizedPayload,
    });
  }
}

export function getCreateTaskErrorDebug(
  error: unknown,
): CreateTaskDebugDetails | null {
  if (!(error instanceof AgenTeamTaskCreationError)) {
    return null;
  }

  return getErrorDebugDetails(error.traceId, error.stage, error.cause ?? error);
}
