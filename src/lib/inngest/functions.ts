import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { runAgenTeamTaskLocally } from "../agen-team/run-task";
import {
  enqueueAgenTeamTask,
  mapChiefToolInputToRunTaskPayload,
  normalizeRunTaskPayload,
} from "../agen-team/create-task";
import {
  loadConfirmationRow,
  loadPendingConfirmationSnapshot,
  markConfirmationEnqueued,
  markConfirmationFailed,
} from "../agen-team/chief/persistence";
import { publishReadyForStory } from "../agen-team/chief/notifications";
import {
  createStrategyForSprint,
  createWeeklyReview,
  getGrowthSprint,
  publishScheduledCalendarItem,
} from "../agen-team/growth/agency-service";

export const runScheduledAgentTask = inngest.createFunction(
  {
    id: "run-scheduled-agent-task",
    triggers: [{ event: "agen-team/run.task" }],
  },
  async ({ event, step }) => {
    const payload = event.data.payload;
    const userId = event.data.user_id;

    // 1. If scheduled for future, sleep until that time
    if (payload.scheduled_utc) {
      await step.sleepUntil(
        "wait-for-schedule",
        new Date(payload.scheduled_utc),
      );
    }

    const result = await step.run("execute-agent-graph", async () => {
      return runAgenTeamTaskLocally({
        payload,
        userId,
      });
    });

    return { success: true, result };
  },
);

/**
 * Inngest handler for the Chief v3 cancellation window.
 *
 * Triggered by `agen-team/chief.execute-confirmation` events emitted from
 * `POST /api/agen-team/chief-chat` when the user clicks
 * "Konfirmasi & mulai publish". The handler sleeps until
 * `scheduledExecuteAt` (= confirm time + 30 s), then re-checks the
 * idempotency row before enqueuing the task. Concurrency is pinned at 1
 * per `confirmationId` so duplicate events resolve to a single execution.
 *
 * Expected event data shape:
 * ```
 * {
 *   confirmationId: string;   // uuid
 *   userId: string;
 *   scheduledExecuteAt: string; // ISO 8601 UTC
 * }
 * ```
 *
 * Skip semantics (returned verbatim so callers can introspect the
 * outcome in test traces):
 * - `cancelled` — user pressed "Batalkan publish" inside the window.
 * - `already_enqueued` — a prior trigger already enqueued the task; the
 *   existing `taskId` is returned for completeness.
 * - `missing_pending` — the idempotency row or its snapshot is gone
 *   (e.g. ledger reset between confirm and execute); the safe path is
 *   to skip rather than rebuild from a possibly-mutated ledger.
 *
 * Failure semantics (Requirement 13.6, task 8.4):
 * - When `enqueueAgenTeamTask` throws a non-retryable error, the row is
 *   marked failed with `failureStatus: "error"` via
 *   {@link markConfirmationFailed} and a `NonRetriableError` is raised
 *   so Inngest does not retry a permanent failure.
 * - When `enqueueAgenTeamTask` returns `status: "rate_limited"`, the row
 *   is marked failed with `failureStatus: "rate_limited"` and the
 *   handler returns `{ failed: true, status: "rate_limited" }` (no
 *   throw — the surface here is "soft failure surface to UI").
 *
 * In both cases, the chief-chat dispatch (route + scope-router) reads
 * the row on the user's next turn and emits a `createAgenTeamTask` tool
 * output with `readyForStory: false` and the matching `status`, which
 * surfaces an error retry/cancel card in `chat-bot.tsx` (task 11.1).
 *
 * @see Requirements 5.4, 5.7, 5.8, 5.11, 6.3, 6.4, 6.5, 6.6, 6.7, 13.6
 * @see ../agen-team/chief/persistence.ts
 * @see ../agen-team/create-task.ts (`enqueueAgenTeamTask` is idempotent on `confirmationId`)
 */
export const chiefExecuteConfirmation = inngest.createFunction(
  {
    id: "chief-execute-confirmation",
    triggers: [{ event: "agen-team/chief.execute-confirmation" }],
    concurrency: { key: "event.data.confirmationId", limit: 1 },
  },
  async ({ event, step }) => {
    const { confirmationId, userId, scheduledExecuteAt } = event.data as {
      confirmationId: string;
      userId: string;
      scheduledExecuteAt: string;
    };

    // Step 1: sleep until the cancellation window expires.
    await step.sleepUntil(
      "cancellation-window",
      new Date(scheduledExecuteAt),
    );

    // Step 2: load the idempotency row and short-circuit on terminal states.
    const row = await step.run("load-idempotency-row", () =>
      loadConfirmationRow(confirmationId, userId),
    );

    if (!row) {
      return { skipped: "missing_pending" as const };
    }

    if (row.cancelledAt !== null) {
      return { skipped: "cancelled" as const };
    }

    if (row.enqueuedAt !== null) {
      return {
        skipped: "already_enqueued" as const,
        taskId: row.taskId,
      };
    }

    // Step 3: load the frozen snapshot. Reading back from the row (rather
    // than recomputing from the ledger) is what makes the payload-freeze
    // guarantee testable — the snapshot is the source of truth.
    const snapshot = await step.run("load-snapshot", () =>
      loadPendingConfirmationSnapshot(confirmationId, userId),
    );

    if (!snapshot) {
      return { skipped: "missing_pending" as const };
    }

    // Step 4: build the agen team task payload from the snapshot and
    // enqueue. `enqueueAgenTeamTask` is idempotent on `confirmationId`
    // (Requirement 6.1) so a retried Inngest step still resolves to a
    // single inserted row.
    //
    // Task 8.4 — non-retryable enqueue failures and `rate_limited`
    // results are persisted on the idempotency row via
    // `markConfirmationFailed` so the chief-chat dispatch can surface a
    // `createAgenTeamTask` tool output with `readyForStory: false` and
    // `status: "error" | "rate_limited"` (Requirement 13.6). We throw
    // `NonRetriableError` after persisting so Inngest does not retry a
    // permanent failure, but the row carries the failure context for the
    // user-facing surface (status endpoint + scope-router emission).
    const result = await step.run("enqueue-task", async () => {
      try {
        const runTaskPayload = mapChiefToolInputToRunTaskPayload(
          snapshot.taskInput,
          confirmationId,
        );
        const normalizedPayload = normalizeRunTaskPayload(
          userId,
          runTaskPayload,
        );
        return await enqueueAgenTeamTask(normalizedPayload, {
          confirmationId,
        });
      } catch (error) {
        // Persist the failure BEFORE re-raising so Inngest's
        // step-failure machinery still sees the error (the step output
        // is the error itself), but the row already carries the
        // failure status for downstream surfaces.
        const message =
          error instanceof Error ? error.message : "Unknown enqueue error";
        await markConfirmationFailed(confirmationId, {
          failureStatus: "error",
          failureMessage: message,
        });
        throw new NonRetriableError(
          `enqueueAgenTeamTask failed for confirmationId=${confirmationId}: ${message}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    });

    // `rate_limited` is a soft failure: the user has too many running
    // tasks and `enqueueAgenTeamTask` declined to insert a new row. We
    // persist it the same way as a hard error so the UI can render the
    // retry/cancel card (Requirement 13.6).
    if (result.status === "rate_limited") {
      await step.run("mark-failed-rate-limited", () =>
        markConfirmationFailed(confirmationId, {
          failureStatus: "rate_limited",
          failureMessage:
            "Terlalu banyak task berjalan. Selesaikan task lain lalu coba lagi.",
        }),
      );
      return {
        failed: true as const,
        status: "rate_limited" as const,
        confirmationId,
      };
    }

    // Step 5: mark the idempotency row as enqueued so subsequent triggers
    // (retry, manual replay) resolve to `already_enqueued` immediately.
    await step.run("mark-enqueued", () =>
      markConfirmationEnqueued(confirmationId, result.taskId),
    );

    // Step 6: notify downstream surfaces that StoryMode can open. The
    // helper is currently a logging stub; the streaming endpoint and the
    // status poller read `enqueuedAt` directly from the idempotency row.
    await step.run("publish-ready-for-story", () =>
      publishReadyForStory({
        userId,
        threadId: row.threadId,
        taskId: result.taskId,
      }),
    );

    return {
      enqueued: true as const,
      taskId: result.taskId,
      threadId: row.threadId,
    };
  },
);

export const createGrowthSprintStrategy = inngest.createFunction(
  {
    id: "growth-sprint-create-strategy",
    triggers: [{ event: "growth-sprint/create-strategy" }],
  },
  async ({ event, step }) => {
    const { sprintId, userId } = event.data as {
      sprintId: string;
      userId: string;
    };

    const result = await step.run("create-strategy-and-calendar", () =>
      createStrategyForSprint({ sprintId, userId }),
    );

    return { success: true, sprintId, result };
  },
);

export const scheduledGrowthSprintPublish = inngest.createFunction(
  {
    id: "growth-sprint-scheduled-publish",
    triggers: [{ event: "growth-sprint/scheduled-publish" }],
  },
  async ({ event, step }) => {
    const { sprintId, calendarItemId, userId } = event.data as {
      sprintId: string;
      calendarItemId: string;
      userId: string;
    };

    const details = await step.run("load-calendar-item", () =>
      getGrowthSprint(userId, sprintId),
    );
    const item = details?.calendar.find((entry) => entry.id === calendarItemId);
    if (!details || !item) {
      return { skipped: "missing_calendar_item" as const, sprintId };
    }

    await step.sleepUntil("wait-for-scheduled-time", item.scheduledFor);

    const result = await step.run("publish-calendar-item", () =>
      publishScheduledCalendarItem({ sprintId, calendarItemId, userId }),
    );

    return { success: true, sprintId, calendarItemId, result };
  },
);

export const growthSprintWeeklyReview = inngest.createFunction(
  {
    id: "growth-sprint-weekly-review",
    triggers: [{ event: "growth-sprint/weekly-review" }],
  },
  async ({ event, step }) => {
    const { sprintId, userId, weekIndex } = event.data as {
      sprintId: string;
      userId: string;
      weekIndex: number;
    };

    await step.sleep("wait-for-week-window", `${Math.max(1, weekIndex) * 7}d`);

    const result = await step.run("create-weekly-review", () =>
      createWeeklyReview({ sprintId, userId, weekIndex }),
    );

    if (weekIndex < 4) {
      await step.sendEvent("schedule-next-weekly-review", {
        name: "growth-sprint/weekly-review",
        data: { sprintId, userId, weekIndex: weekIndex + 1 },
      });
    }

    return { success: true, sprintId, weekIndex, result };
  },
);
