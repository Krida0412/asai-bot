/**
 * Chief Chat (Pak Arga) confirmation-status endpoint — task 8.3.
 *
 * Lightweight read-only endpoint the client polls when its local
 * 30-second countdown reaches zero. The router/Inngest handler owns the
 * authoritative state transitions on `chief_confirmation_idempotency`;
 * the client uses this endpoint solely to discover whether the row is:
 *
 * - `armed`        → still pending; cancellation window has not yet expired
 *                    (or Inngest has not yet completed the enqueue step).
 * - `cancelled`    → user clicked "Batalkan publish" in time; no task will
 *                    be created.
 * - `enqueued`     → Inngest committed the row and `taskId` is now valid;
 *                    the client should transition into StoryMode.
 * - `error`        → Inngest hit a non-retryable enqueue error. The client
 *                    should surface the retry/cancel card and NOT open
 *                    StoryMode (Requirement 13.6).
 * - `rate_limited` → Inngest declined to insert because the user already
 *                    has too many running tasks. Same UI treatment as
 *                    `error`, with a tailored message.
 *
 * Contract:
 * - Auth: session user only. Authz on the row itself is enforced by
 *   `loadConfirmationRow`, which scopes the lookup with
 *   `WHERE confirmation_id = $1 AND user_id = $2`. A row owned by a
 *   different user surfaces as `404 Not found` so the client cannot probe
 *   for foreign confirmation IDs.
 * - Read-only: no mutation, no Inngest dispatch. Safe to poll.
 *
 * Response shape:
 *   { status: "armed" | "cancelled" | "enqueued", taskId?: string }
 *   { status: "error" | "rate_limited", message?: string }
 *
 * `taskId` is only included when `status === "enqueued"` so the client
 * does not race on a half-built row (Requirements 5.10, 13.5).
 *
 * @see ../../../../../.kiro/specs/agentic-chief-v3/requirements.md Requirements 5.10, 13.5, 13.6
 */

import { loadConfirmationRow } from "@/lib/agen-team/chief/persistence";
import { getSession } from "auth/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(request.url);
    const confirmationId = url.searchParams.get("confirmationId");
    if (!confirmationId) {
      return Response.json(
        { message: "Missing confirmationId" },
        { status: 400 },
      );
    }

    // Validate UUID shape (lightweight; loadConfirmationRow has its own
    // ownership filter via WHERE user_id = $2).
    if (!UUID_PATTERN.test(confirmationId)) {
      return Response.json(
        { message: "Invalid confirmationId" },
        { status: 400 },
      );
    }

    const row = await loadConfirmationRow(confirmationId, userId);
    if (!row) {
      return Response.json({ message: "Not found" }, { status: 404 });
    }

    // Resolution order matters: enqueued and cancelled are terminal,
    // mutually-exclusive happy/cancel paths. Failure is also terminal but
    // we only surface it when neither happy nor cancel paths fired
    // (`enqueuedAt`/`cancelledAt` are both null) — the persistence
    // helpers (`markConfirmationFailed`) preserve this invariant by
    // refusing to overwrite either timestamp.
    if (row.enqueuedAt !== null) {
      return Response.json({
        status: "enqueued" as const,
        taskId: row.taskId,
      });
    }

    if (row.cancelledAt !== null) {
      return Response.json({ status: "cancelled" as const });
    }

    if (row.failedAt !== null && row.failureStatus) {
      const failureStatus =
        row.failureStatus === "rate_limited"
          ? ("rate_limited" as const)
          : ("error" as const);
      const response: {
        status: "error" | "rate_limited";
        message?: string;
      } = { status: failureStatus };
      if (row.failureMessage) {
        response.message = row.failureMessage;
      }
      return Response.json(response);
    }

    return Response.json({ status: "armed" as const });
  } catch (error) {
    console.error("[chief-chat/confirmation-status]", error);
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}
