import {
  enqueueAgenTeamTask,
  normalizeRunTaskPayload,
} from "@/lib/agen-team/create-task";
import { handleLegacyChiefConversation } from "@/lib/agen-team/legacy-chief-gateway";
import { invalidateResponseCachePrefix } from "@/lib/agen-team/response-cache";
import { auth } from "@/lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AgentTaskTable,
  CostTrackingTable,
  TaskMediaAssetTable,
  TaskOutputTable,
} from "@/lib/db/pg/schema.pg";
import { inngest } from "@/lib/inngest/client";
import { colorize } from "consola/utils";
import { and, desc, eq, inArray } from "drizzle-orm";
import globalLogger from "logger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Agen Team Gateway: "),
});

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const action = payload.action;
    const userId = session.user.id;

    if (action === "chief_message" || action === "run_task") {
      const legacyEnabled =
        process.env.AGEN_TEAM_LEGACY_API_ENABLED === "true";
      if (!legacyEnabled) {
        logger.warn("legacy chief router called without flag", {
          action,
          userId,
        });
        return new Response("Gone", { status: 410 });
      }
      // dev-only path continues below
    }

    if (action === "chief_message") {
      const response = await handleLegacyChiefConversation(
        userId,
        payload.message,
        payload.session_id,
      );

      return NextResponse.json({
        message_text: response.messageText,
        options: response.options,
        state: response.state,
        requires_action: response.requiresAction,
        metadata: response.metadata
          ? {
              intent_type: response.metadata.intentType,
              topic: response.metadata.topic,
            }
          : undefined,
      });
    }

    if (action === "run_task") {
      const taskPayload = normalizeRunTaskPayload(userId, payload.task_payload);

      if (!taskPayload.intent_type || !taskPayload.topic) {
        return NextResponse.json(
          { error: "Missing required fields: intent_type and topic" },
          { status: 400 },
        );
      }

      const result = await enqueueAgenTeamTask(taskPayload);

      if (result.status === "already_exists") {
        return NextResponse.json({
          status: "already_exists",
          task_id: result.taskId,
          message: "Task already exists.",
        });
      }

      if (result.status === "rate_limited") {
        return NextResponse.json({
          status: "rate_limited",
          task_id: result.taskId,
          message: "Too many running tasks. Limit is 2 per user.",
        });
      }

      if (taskPayload.is_scheduled && taskPayload.scheduled_utc) {
        return NextResponse.json({
          status: "scheduled",
          task_id: result.taskId,
          message: `Task dijadwalkan untuk ${new Date(taskPayload.scheduled_utc).toLocaleString()}`,
        });
      }

      return NextResponse.json({
        status: "acknowledged",
        task_id: result.taskId,
        message: "Task queued for execution",
      });
    }

    if (action === "cancel_task") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      await db
        .update(AgentTaskTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(eq(AgentTaskTable.id, taskId), eq(AgentTaskTable.userId, userId)),
        );

      invalidateResponseCachePrefix(`agen-team:tasks:${userId}`);
      return NextResponse.json({
        status: "cancelled",
        task_id: taskId,
      });
    }

    if (action === "delete_task") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      await db
        .delete(AgentTaskTable)
        .where(
          and(eq(AgentTaskTable.id, taskId), eq(AgentTaskTable.userId, userId)),
        );

      invalidateResponseCachePrefix(`agen-team:tasks:${userId}`);
      return NextResponse.json({
        status: "deleted",
        task_id: taskId,
      });
    }

    if (action === "retry_task") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      const rows = await db
        .select()
        .from(AgentTaskTable)
        .where(
          and(eq(AgentTaskTable.id, taskId), eq(AgentTaskTable.userId, userId)),
        )
        .limit(1);

      if (!rows.length) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const row = rows[0];
      if (row.status === "running") {
        return NextResponse.json({
          status: "already_running",
          task_id: taskId,
        });
      }

      if (row.status !== "failed" && row.status !== "cancelled") {
        return NextResponse.json({
          status: "not_retryable",
          task_id: taskId,
          message: `Task with status '${row.status}' cannot be retried`,
        });
      }

      await db
        .update(AgentTaskTable)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(AgentTaskTable.id, taskId));

      await db
        .delete(TaskOutputTable)
        .where(eq(TaskOutputTable.taskId, taskId));
      await db
        .delete(CostTrackingTable)
        .where(
          and(
            eq(CostTrackingTable.taskId, taskId),
            eq(CostTrackingTable.userId, userId),
          ),
        );

      const taskPayload =
        typeof row.inputPayload === "string"
          ? JSON.parse(row.inputPayload as string)
          : row.inputPayload;

      await inngest.send({
        name: "agen-team/run.task",
        data: {
          payload: { ...taskPayload, task_id: taskId, user_id: userId },
          user_id: userId,
        },
      });

      invalidateResponseCachePrefix(`agen-team:tasks:${userId}`);
      return NextResponse.json({
        status: "retried",
        task_id: taskId,
      });
    }

    if (action === "list_tasks") {
      const limit = Math.min(Math.max(payload.limit || 20, 1), 100);
      const offset = Math.max(payload.offset || 0, 0);

      const rows = await db
        .select({
          id: AgentTaskTable.id,
          intentType: AgentTaskTable.intentType,
          status: AgentTaskTable.status,
          isScheduled: AgentTaskTable.isScheduled,
          scheduledTime: AgentTaskTable.scheduledTime,
          createdAt: AgentTaskTable.createdAt,
          updatedAt: AgentTaskTable.updatedAt,
        })
        .from(AgentTaskTable)
        .where(eq(AgentTaskTable.userId, userId))
        .orderBy(desc(AgentTaskTable.createdAt))
        .limit(limit)
        .offset(offset);

      return NextResponse.json({ tasks: rows });
    }

    if (action === "get_task_result") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      const rows = await db
        .select()
        .from(TaskOutputTable)
        .where(eq(TaskOutputTable.taskId, taskId))
        .orderBy(TaskOutputTable.createdAt);

      return NextResponse.json({
        task_id: taskId,
        outputs: rows,
      });
    }

    if (action === "get_task_media") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      const rows = await db
        .select()
        .from(TaskMediaAssetTable)
        .where(eq(TaskMediaAssetTable.taskId, taskId));

      return NextResponse.json({ media: rows });
    }

    if (action === "approve_task") {
      const taskId = payload.task_id;
      if (!taskId) {
        return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
      }

      await db
        .update(AgentTaskTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(AgentTaskTable.id, taskId));

      const outRows = await db
        .select()
        .from(TaskOutputTable)
        .where(
          and(
            eq(TaskOutputTable.taskId, taskId),
            inArray(TaskOutputTable.stageName, [
              "marketing_draft",
              "marketing",
            ]),
          ),
        )
        .limit(1);

      if (outRows.length > 0 && outRows[0].content) {
        const content =
          typeof outRows[0].content === "string"
            ? JSON.parse(outRows[0].content as string)
            : (outRows[0].content as Record<string, unknown>);

        content.status = "approved";

        if ("publication_url" in content) {
          delete content.publication_url;
        }

        await db
          .update(TaskOutputTable)
          .set({ content })
          .where(eq(TaskOutputTable.id, outRows[0].id));
      }

      invalidateResponseCachePrefix(`agen-team:tasks:${userId}`);
      return NextResponse.json({
        status: "approved",
        message: "Draft task berhasil disetujui untuk penggunaan internal.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Agen Team Gateway Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
