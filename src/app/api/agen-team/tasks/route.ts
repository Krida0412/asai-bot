import {
  getCachedResponse,
  setCachedResponse,
} from "@/lib/agen-team/response-cache";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AgentTaskTable,
  CostTrackingTable,
  TaskOutputTable,
} from "@/lib/db/pg/schema.pg";
import { getSession } from "auth/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isTaskStale } from "@/lib/agen-team/task-lifecycle";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const cacheKey = `agen-team:tasks:${userId}`;
    const cached = getCachedResponse<{ tasks: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Agen-Team-Cache": "HIT" },
      });
    }

    // Fetch all tasks for user, ordered by newest first
    const tasks = await db
      .select()
      .from(AgentTaskTable)
      .where(eq(AgentTaskTable.userId, userId))
      .orderBy(desc(AgentTaskTable.createdAt));

    if (tasks.length === 0) {
      const emptyPayload = { tasks: [] };
      setCachedResponse(cacheKey, emptyPayload, 5000);
      return NextResponse.json(emptyPayload, {
        headers: { "X-Agen-Team-Cache": "MISS" },
      });
    }

    const taskIds = tasks.map((t) => t.id);

    // Fetch all outputs for these tasks in one query
    const outputs = await db
      .select()
      .from(TaskOutputTable)
      .where(inArray(TaskOutputTable.taskId, taskIds))
      .orderBy(TaskOutputTable.createdAt);

    // Fetch total cost per task
    const costs = await db
      .select({
        taskId: CostTrackingTable.taskId,
        totalCost: sql<string>`COALESCE(SUM(${CostTrackingTable.costUsd}), '0')`,
      })
      .from(CostTrackingTable)
      .where(
        inArray(CostTrackingTable.taskId, taskIds.filter(Boolean) as string[]),
      )
      .groupBy(CostTrackingTable.taskId);

    // Build cost map
    const costMap = new Map<string, number>();
    for (const c of costs) {
      if (c.taskId) costMap.set(c.taskId, parseFloat(c.totalCost));
    }

    // Group outputs by taskId
    const outputsMap = new Map<string, typeof outputs>();
    for (const o of outputs) {
      if (!outputsMap.has(o.taskId)) outputsMap.set(o.taskId, []);
      outputsMap.get(o.taskId)!.push(o);
    }

    // Assemble response
    const now = new Date();
    const result = tasks.map((task) => {
      const taskOutputs = outputsMap.get(task.id) ?? [];
      const totalTokens = taskOutputs.reduce(
        (acc, output) =>
          acc + (output.tokenUsageInput ?? 0) + (output.tokenUsageOutput ?? 0),
        0,
      );
      const taskPayload = (task.inputPayload ?? {}) as Record<string, unknown>;

      const lastOutput = taskOutputs[taskOutputs.length - 1];
      const isStale = isTaskStale({
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        lastOutputAt: lastOutput?.createdAt,
        now,
      });

      const finalStatus = isStale ? "failed" : task.status;

      return {
        id: task.id,
        intentType: task.intentType,
        status: finalStatus,
        isScheduled: task.isScheduled ?? false,
        scheduledTime: task.scheduledTime?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        outputs: taskOutputs.map((o) => ({
          stageName: o.stageName,
          content: o.content,
          tokenUsageInput: o.tokenUsageInput ?? 0,
          tokenUsageOutput: o.tokenUsageOutput ?? 0,
          createdAt: o.createdAt.toISOString(),
        })),
        totalTokens,
        totalCostUsd: costMap.get(task.id) ?? 0,
        budget: {
          maxTotalTokens:
            typeof taskPayload.max_total_tokens === "number"
              ? taskPayload.max_total_tokens
              : null,
          maxBudgetUsd:
            typeof taskPayload.max_budget_usd === "number"
              ? taskPayload.max_budget_usd
              : null,
          maxSources:
            typeof taskPayload.max_sources === "number"
              ? taskPayload.max_sources
              : null,
        },
        modelProfile:
          typeof taskPayload.model_profile === "object" &&
          taskPayload.model_profile !== null
            ? taskPayload.model_profile
            : null,
      };
    });

    const responsePayload = { tasks: result };
    setCachedResponse(cacheKey, responsePayload, 5000);
    return NextResponse.json(responsePayload, {
      headers: { "X-Agen-Team-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("GET /api/agen-team/tasks error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
