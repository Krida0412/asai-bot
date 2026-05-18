import { executeAgentTeam } from "./graph";
import { clearBeatKeys, emitStoryError } from "./story";
import { pgDb } from "../db/pg/db.pg";
import { AgentTaskTable, TaskOutputTable } from "../db/pg/schema.pg";
import { loadChiefMemory } from "./utils/memory-manager";
import { createEmitter } from "./utils/progress-emitter";
import { eq } from "drizzle-orm";

function getStageContent(data: unknown) {
  if (data === undefined) return null;
  return data;
}

async function persistTaskStages(args: {
  taskId: string;
  stages?: Array<{ stage: string; data: unknown }>;
  publicationResult?: unknown;
}) {
  const rows: Array<{
    taskId: string;
    stageName: string;
    content: unknown;
    tokenUsageInput: number;
    tokenUsageOutput: number;
  }> = [];

  for (const stage of args.stages ?? []) {
    if (!stage?.stage) continue;
    rows.push({
      taskId: args.taskId,
      stageName: stage.stage,
      content: getStageContent(stage.data),
      tokenUsageInput: 0,
      tokenUsageOutput: 0,
    });
  }

  if (args.publicationResult) {
    rows.push({
      taskId: args.taskId,
      stageName: "instagram_publish_result",
      content: args.publicationResult,
      tokenUsageInput: 0,
      tokenUsageOutput: 0,
    });
  }

  if (rows.length === 0) return;

  await pgDb
    .insert(TaskOutputTable)
    .values(rows)
    .catch((error) => {
      console.error("[agen-team] failed to persist task outputs", {
        taskId: args.taskId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown output persist error",
      });
    });
}

export async function runAgenTeamTaskLocally(params: {
  payload: {
    task_id: string;
    user_id: string;
    intent_type: string;
    topic: string;
    special_focus?: string;
    max_budget_usd?: number;
    max_total_tokens?: number;
    max_sources?: number;
    needs_photo?: boolean;
    photo_query?: string;
    user_memory_context?: string;
  };
  userId: string;
}) {
  const payload = params.payload;
  const userId = params.userId;
  const taskId = payload.task_id;
  const emitter = createEmitter(taskId);

  let userMemoryContext = payload.user_memory_context || "";
  if (payload.intent_type === "continue_from_memory") {
    const memory = (await loadChiefMemory(userId)) || "";
    userMemoryContext = `${userMemoryContext}\n${memory}`.trim();
  }

  try {
    const graphResult = await executeAgentTeam({
      taskId,
      userId,
      intent: payload.intent_type,
      topic: payload.topic,
      specialFocus: payload.special_focus,
      maxBudgetUsd: payload.max_budget_usd || 0.35,
      maxTotalTokens: payload.max_total_tokens || 12000,
      maxSources: payload.max_sources || 8,
      needsPhoto: payload.needs_photo || false,
      photoQuery: payload.photo_query,
      userMemoryContext,
      emitter,
    });

    await persistTaskStages({
      taskId,
      stages: graphResult.stages,
      publicationResult: graphResult.publicationResult,
    });

    await pgDb
      .update(AgentTaskTable)
      .set({
        status: graphResult.status === "failed" ? "failed" : "completed",
        updatedAt: new Date(),
      })
      .where(eq(AgentTaskTable.id, taskId));

    await emitter.done({
      stages: graphResult.stages,
      status: graphResult.status,
    });

    return {
      status: graphResult.status,
      stages: graphResult.stages,
    };
  } catch (error: any) {
    await emitStoryError(emitter, {
      taskId,
      intentType: payload.intent_type,
      topic: payload.topic,
    });
    clearBeatKeys(taskId);

    await pgDb
      .update(AgentTaskTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(AgentTaskTable.id, taskId));

    await pgDb.insert(TaskOutputTable).values({
      taskId,
      stageName: "system_error",
      content: {
        type: "exception",
        message: error.message,
      },
      tokenUsageInput: 0,
      tokenUsageOutput: 0,
    });

    await emitter.done(undefined, error.message);

    throw error;
  }
}
