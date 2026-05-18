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
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const cacheKey = `agen-team:metrics:${userId}`;
    const cached = getCachedResponse<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Agen-Team-Cache": "HIT" },
      });
    }
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [taskAgg] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        running: sql<number>`COALESCE(SUM(CASE WHEN ${AgentTaskTable.status} = 'running' THEN 1 ELSE 0 END), 0)`,
        completed: sql<number>`COALESCE(SUM(CASE WHEN ${AgentTaskTable.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
        failed: sql<number>`COALESCE(SUM(CASE WHEN ${AgentTaskTable.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
      })
      .from(AgentTaskTable)
      .where(eq(AgentTaskTable.userId, userId));

    const [taskAgg7d] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`COALESCE(SUM(CASE WHEN ${AgentTaskTable.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
      })
      .from(AgentTaskTable)
      .where(
        and(
          eq(AgentTaskTable.userId, userId),
          gte(AgentTaskTable.createdAt, sevenDaysAgo),
        ),
      );

    const [costAgg] = await db
      .select({
        totalCostUsd: sql<string>`COALESCE(SUM(${CostTrackingTable.costUsd}), '0')`,
      })
      .from(CostTrackingTable)
      .where(eq(CostTrackingTable.userId, userId));

    const [tokenAgg] = await db
      .select({
        inputTokens: sql<number>`COALESCE(SUM(${TaskOutputTable.tokenUsageInput}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${TaskOutputTable.tokenUsageOutput}), 0)`,
      })
      .from(TaskOutputTable)
      .innerJoin(AgentTaskTable, eq(TaskOutputTable.taskId, AgentTaskTable.id))
      .where(eq(AgentTaskTable.userId, userId));

    const totalTasks = Number(taskAgg?.total ?? 0);
    const completedTasks = Number(taskAgg?.completed ?? 0);
    const failedTasks = Number(taskAgg?.failed ?? 0);
    const totalCostUsd = Number.parseFloat(costAgg?.totalCostUsd ?? "0");
    const inputTokens = Number(tokenAgg?.inputTokens ?? 0);
    const outputTokens = Number(tokenAgg?.outputTokens ?? 0);
    const totalTokens = inputTokens + outputTokens;

    const successRatePct =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const failureRatePct =
      totalTasks > 0 ? (failedTasks / totalTasks) * 100 : 0;
    const avgCostPerTask = totalTasks > 0 ? totalCostUsd / totalTasks : 0;
    const avgTokensPerTask = totalTasks > 0 ? totalTokens / totalTasks : 0;

    const responsePayload = {
      metrics: {
        totalTasks,
        runningTasks: Number(taskAgg?.running ?? 0),
        completedTasks,
        failedTasks,
        totalCostUsd,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
        totalTokens,
        successRatePct,
        failureRatePct,
        avgCostPerTask,
        avgTokensPerTask,
      },
      last7d: {
        totalTasks: Number(taskAgg7d?.total ?? 0),
        completedTasks: Number(taskAgg7d?.completed ?? 0),
      },
    };

    setCachedResponse(cacheKey, responsePayload, 7000);
    return NextResponse.json(responsePayload, {
      headers: { "X-Agen-Team-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("GET /api/agen-team/metrics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
