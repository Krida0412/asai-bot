/**
 * Cost Query Tool — ported from python-engine operations_crew/officer.py
 * Queries cost_tracking table for monthly usage report.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { pgDb as db } from "../../db/pg/db.pg";
import { CostTrackingTable } from "../../db/pg/schema.pg";
import { sql } from "drizzle-orm";

export const costQueryTool = new DynamicStructuredTool({
  name: "database_cost_query",
  description:
    "Mengambil laporan aggregasi total biaya penggunaan LLM bulan ini dari database per user.",
  schema: z.object({
    userId: z.string().describe("ID dari user"),
  }),
  func: async ({ userId }) => {
    try {
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

      if (!rows.length || !rows[0].totalCost) {
        return "Belum ada biaya yang tercatat di bulan ini.";
      }

      let info = `Total Tasks: ${rows[0].totalTasks}\nTotal Cost: $${Number(rows[0].totalCost).toFixed(4)}\n`;
      for (const r of rows) {
        if (r.model) {
          info += `- ${r.model}: $${Number(r.modelCost).toFixed(4)}\n`;
        }
      }
      return info;
    } catch (e: any) {
      return `Error Query DB: ${e.message}`;
    }
  },
});
