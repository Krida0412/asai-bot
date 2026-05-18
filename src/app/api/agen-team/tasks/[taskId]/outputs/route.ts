import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AgentTaskTable, TaskOutputTable } from "@/lib/db/pg/schema.pg";
import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { taskId } = await params;

    // Verify this task belongs to the user
    const [task] = await db
      .select({ id: AgentTaskTable.id })
      .from(AgentTaskTable)
      .where(
        and(eq(AgentTaskTable.id, taskId), eq(AgentTaskTable.userId, userId)),
      );

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const outputs = await db
      .select()
      .from(TaskOutputTable)
      .where(eq(TaskOutputTable.taskId, taskId))
      .orderBy(TaskOutputTable.createdAt);

    return NextResponse.json({
      taskId,
      outputs: outputs.map((o) => ({
        id: o.id,
        stageName: o.stageName,
        content: o.content,
        tokenUsageInput: o.tokenUsageInput ?? 0,
        tokenUsageOutput: o.tokenUsageOutput ?? 0,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/agen-team/tasks/[taskId]/outputs error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
