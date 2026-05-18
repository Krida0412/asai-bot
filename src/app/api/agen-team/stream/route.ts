/**
 * SSE Stream Route — rewritten from Python proxy to DB polling.
 * Polls task_outputs table for progress events and streams to browser.
 */
import { auth } from "@/lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AgentTaskTable, TaskOutputTable } from "@/lib/db/pg/schema.pg";
import { eq, and, gt, asc } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return new Response(JSON.stringify({ error: "Missing taskId" }), {
        status: 400,
      });
    }

    const userId = session.user.id;

    // Verify task belongs to user
    const taskRows = await db
      .select({ status: AgentTaskTable.status })
      .from(AgentTaskTable)
      .where(
        and(eq(AgentTaskTable.id, taskId), eq(AgentTaskTable.userId, userId)),
      )
      .limit(1);

    if (!taskRows.length) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
      });
    }

    // If task is already done, return immediate done event
    if (
      taskRows[0].status === "completed" ||
      taskRows[0].status === "failed" ||
      taskRows[0].status === "cancelled"
    ) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const event = JSON.stringify({
            type: "done",
            msg: `Task already ${taskRows[0].status}`,
            pct: 100,
            ts: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
          controller.close();
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Poll DB for progress events
    const encoder = new TextEncoder();
    let lastSeenId: string | null = null;
    let isDone = false;

    const body = new ReadableStream({
      async start(controller) {
        const pollInterval = 750;
        const maxPolls = 800;
        let polls = 0;

        const poll = async () => {
          if (isDone || polls >= maxPolls) {
            if (!isDone) {
              const timeout = JSON.stringify({
                type: "done",
                error: "Stream timeout",
                ts: new Date().toISOString(),
              });
              controller.enqueue(encoder.encode(`data: ${timeout}\n\n`));
            }
            controller.close();
            return;
          }

          polls++;

          try {
            // Fetch new progress events since last seen
            const query = db
              .select()
              .from(TaskOutputTable)
              .where(
                and(
                  eq(TaskOutputTable.taskId, taskId),
                  lastSeenId ? gt(TaskOutputTable.id, lastSeenId) : undefined,
                ),
              )
              .orderBy(asc(TaskOutputTable.createdAt))
              .limit(20);

            const rows = await query;

            for (const row of rows) {
              const content = row.content as Record<string, unknown>;
              if (content && typeof content === "object" && "type" in content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(content)}\n\n`),
                );

                if (content.type === "done") {
                  isDone = true;
                }
              }

              lastSeenId = row.id;
            }

            // Also check if task status changed externally
            if (!isDone) {
              const taskCheck = await db
                .select({ status: AgentTaskTable.status })
                .from(AgentTaskTable)
                .where(eq(AgentTaskTable.id, taskId))
                .limit(1);

              if (
                taskCheck[0] &&
                (taskCheck[0].status === "completed" ||
                  taskCheck[0].status === "failed" ||
                  taskCheck[0].status === "cancelled")
              ) {
                // Task finished but we might not have the done event yet
                // Send a synthetic done event
                const syntheticDone = JSON.stringify({
                  type: "done",
                  msg: `Task ${taskCheck[0].status}`,
                  pct: 100,
                  ts: new Date().toISOString(),
                });
                controller.enqueue(
                  encoder.encode(`data: ${syntheticDone}\n\n`),
                );
                isDone = true;
              }
            }
          } catch (e) {
            console.warn("SSE poll error:", e);
          }

          if (!isDone) {
            // Send keepalive
            controller.enqueue(encoder.encode(": keepalive\n\n"));
            setTimeout(poll, pollInterval);
          } else {
            controller.close();
          }
        };

        // Start polling
        await poll();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("SSE stream error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
