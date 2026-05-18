/**
 * Cost Tracker — ported from python-engine/app/utils/cost_tracker.py
 * Calculates and logs LLM token costs using Drizzle ORM.
 */
import { pgDb as db } from "../../db/pg/db.pg";
import { CostTrackingTable } from "../../db/pg/schema.pg";
import { sql } from "drizzle-orm";

// Approximate pricing (USD per 1K tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "mistral-small-latest": { input: 0.0002, output: 0.0006 },
  "mistral-medium-latest": { input: 0.0009, output: 0.0027 },
  "mistral-large-latest": { input: 0.003, output: 0.009 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
  "claude-sonnet-4-5": { input: 0.003, output: 0.015 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] || { input: 0.002, output: 0.008 };
  return (
    (inputTokens / 1000) * pricing.input +
    (outputTokens / 1000) * pricing.output
  );
}

export async function logCost(
  userId: string,
  taskId: string,
  service: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const costUsd = calculateCost(model, inputTokens, outputTokens);
  try {
    await db.insert(CostTrackingTable).values({
      userId,
      taskId,
      service,
      model,
      inputTokens,
      outputTokens,
      costUsd,
    });
  } catch (e) {
    console.warn("⚠️ Failed to log cost:", e);
  }
  return costUsd;
}

export async function getMonthlyCost(userId: string): Promise<
  Array<{
    totalTasks: number;
    totalCost: number;
    model: string;
    modelCost: number;
  }>
> {
  const startOfMonth = sql`date_trunc('month', CURRENT_TIMESTAMP)`;
  const rows = await db
    .select({
      totalTasks: sql<number>`COUNT(DISTINCT ${CostTrackingTable.taskId})::int`,
      totalCost: sql<number>`COALESCE(SUM(${CostTrackingTable.costUsd}::numeric), 0)`,
      model: CostTrackingTable.model,
      modelCost: sql<number>`COALESCE(SUM(${CostTrackingTable.costUsd}::numeric), 0)`,
    })
    .from(CostTrackingTable)
    .where(
      sql`${CostTrackingTable.userId} = ${userId} AND ${CostTrackingTable.createdAt} >= ${startOfMonth}`,
    )
    .groupBy(CostTrackingTable.model);

  return rows;
}
