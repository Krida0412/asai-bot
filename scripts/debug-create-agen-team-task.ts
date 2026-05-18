import "dotenv/config";
import { createAgenTeamTaskFromChief } from "@/lib/agen-team/create-task";
import { pgDb } from "@/lib/db/pg/db.pg";
import { AgentTaskTable } from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";

async function resolveUserId() {
  if (process.env.AGEN_TEAM_DEBUG_USER_ID) {
    return process.env.AGEN_TEAM_DEBUG_USER_ID;
  }

  const users = await pgDb.execute(sql`
    select u.id, u.email,
    coalesce(sum(case when t.status = 'running' then 1 else 0 end), 0)::int as running_count
    from "user" u
    left join agent_tasks t on t.user_id = u.id
    group by u.id, u.email, u.created_at
    having coalesce(sum(case when t.status = 'running' then 1 else 0 end), 0) < 2
    order by running_count asc, u.created_at desc
    limit 1
  `);

  if (!users.rows.length) {
    throw new Error(
      "No eligible users found. Set AGEN_TEAM_DEBUG_USER_ID or reduce running task count first.",
    );
  }

  console.log("[debug-create-agen-team-task] using user", users.rows[0]);
  return String(users.rows[0].id);
}

async function main() {
  const userId = await resolveUserId();

  const result = await createAgenTeamTaskFromChief({
    userId,
    input: {
      intentType: "research_and_draft_content",
      topic: "Tren AI 2026",
      brief: "Riset tren AI 2026 dan buat draft konten sosmed.",
      maxSources: 8,
      needsPhoto: false,
    },
  });

  const createdTask = await pgDb
    .select({
      id: AgentTaskTable.id,
      intentType: AgentTaskTable.intentType,
      status: AgentTaskTable.status,
      createdAt: AgentTaskTable.createdAt,
    })
    .from(AgentTaskTable)
    .where(eq(AgentTaskTable.id, result.taskId))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        result,
        createdTask: createdTask[0] ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[debug-create-agen-team-task] failed", error);
  process.exitCode = 1;
});
