/**
 * Chief Chat (Pak Arga) v3 — Persistence Helpers
 *
 * Helpers around the two v3 tables introduced in task 1.4:
 *
 * - `chief_brief_ledger` — per-thread `BriefLedger` snapshot used by
 *   `Scope_Router` to make deterministic decisions across requests
 *   (Requirement 1.8).
 * - `chief_confirmation_idempotency` — per-`confirmationId` idempotency row
 *   that stores the frozen payload snapshot, plus `cancelledAt` /
 *   `enqueuedAt` timestamps that gate the 30 s cancellation window
 *   (Requirements 6.1–6.3, 6.8, 7.1–7.5).
 *
 * Concurrency-sensitive transitions (`markConfirmationCancelled`,
 * `markConfirmationEnqueued`) are wrapped in a transaction with
 * `SELECT ... FOR UPDATE` to acquire a row-level lock so that the
 * client-side cancel button and the Inngest scheduled enqueue cannot race
 * (Requirements 6.3, 7.5).
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/design.md "Persistence Layer"
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirements 6, 7
 */

import { and, eq } from "drizzle-orm";
import logger from "logger";

import { pgDb } from "@/lib/db/pg/db.pg";
import {
  ChiefBriefLedgerTable,
  ChiefConfirmationIdempotencyTable,
  type ChiefConfirmationIdempotencyEntity,
} from "@/lib/db/pg/schema.pg";

import {
  BriefLedgerSchema,
  PendingConfirmationSchema,
  type BriefLedger,
  type PendingConfirmation,
} from "@/lib/agen-team/chief/schemas";

// ---------------------------------------------------------------------------
// Brief Ledger
// ---------------------------------------------------------------------------

/**
 * Load the persisted `BriefLedger` for the given `(threadId, userId)` pair.
 *
 * - Returns `null` when the row does not exist (fresh thread).
 * - Returns `null` when the persisted JSON fails `BriefLedgerSchema` parsing
 *   (defense-in-depth against corrupted / out-of-version payloads); a
 *   warning is emitted so that operators can investigate.
 *
 * @see Requirement 1.8
 */
export async function loadLedger(
  threadId: string,
  userId: string,
): Promise<BriefLedger | null> {
  const [row] = await pgDb
    .select({
      ledger: ChiefBriefLedgerTable.ledger,
      userId: ChiefBriefLedgerTable.userId,
    })
    .from(ChiefBriefLedgerTable)
    .where(
      and(
        eq(ChiefBriefLedgerTable.threadId, threadId),
        eq(ChiefBriefLedgerTable.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const parsed = BriefLedgerSchema.safeParse(row.ledger);
  if (!parsed.success) {
    logger.warn(
      "[chief.persistence] loadLedger: ledger payload failed schema validation",
      {
        threadId,
        userId,
        issues: parsed.error.issues,
      },
    );
    return null;
  }

  return parsed.data;
}

/**
 * Upsert the `BriefLedger` for a `(threadId, userId)` pair.
 *
 * The ledger payload is validated through `BriefLedgerSchema.parse()` before
 * write so that downstream readers can trust the persisted shape (this also
 * applies the schema defaults for arrays, `briefMaturity`, etc.).
 *
 * Conflict on `threadId` updates the row in place — `userId` is set on the
 * `excluded` row, but the original `userId` is preserved in the `WHERE`
 * clause so cross-user collisions on the same `threadId` cannot silently
 * overwrite ownership. (Thread IDs are UUIDs and therefore globally unique
 * in practice; the assertion here is a safety net.)
 *
 * @see Requirements 1.8, 6.2
 */
export async function saveLedger(
  threadId: string,
  userId: string,
  ledger: BriefLedger,
): Promise<void> {
  const validated = BriefLedgerSchema.parse(ledger);

  await pgDb
    .insert(ChiefBriefLedgerTable)
    .values({
      threadId,
      userId,
      ledger: validated,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ChiefBriefLedgerTable.threadId,
      set: {
        userId,
        ledger: validated,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Confirmation idempotency rows
// ---------------------------------------------------------------------------

export interface UpsertConfirmationRowArgs {
  confirmationId: string;
  taskId: string;
  userId: string;
  threadId: string;
  snapshot: PendingConfirmation;
}

/**
 * Insert the idempotency row for a fresh `confirmationId`.
 *
 * The snapshot is content-addressed by `confirmationId`, so a re-render of
 * the same Confirm_Card_Rich (e.g. user reloads the page) is treated as a
 * no-op — `inserted: false` is returned. Callers MUST NOT mutate the
 * snapshot once persisted; payload freeze is enforced by reading back from
 * this row at execute time.
 *
 * @see Requirements 6.1, 6.2, 7.1, 7.5, 7.6
 */
export async function upsertConfirmationRow(
  args: UpsertConfirmationRowArgs,
): Promise<{ inserted: boolean }> {
  const validatedSnapshot = PendingConfirmationSchema.parse(args.snapshot);

  const inserted = await pgDb
    .insert(ChiefConfirmationIdempotencyTable)
    .values({
      confirmationId: args.confirmationId,
      taskId: args.taskId,
      userId: args.userId,
      threadId: args.threadId,
      snapshot: validatedSnapshot,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: ChiefConfirmationIdempotencyTable.confirmationId,
    })
    .returning({
      confirmationId: ChiefConfirmationIdempotencyTable.confirmationId,
    });

  return { inserted: inserted.length > 0 };
}

export type MarkCancelledStatus =
  | "cancelled"
  | "already_cancelled"
  | "already_enqueued"
  | "not_found";

/**
 * Atomically mark a confirmation row as cancelled.
 *
 * Wrapped in a transaction with `SELECT ... FOR UPDATE` so concurrent
 * triggers (client cancel button vs. backend Inngest enqueue) observe a
 * single linear order. The terminal-state checks ensure idempotency:
 *
 * - `enqueuedAt != null` → `already_enqueued` (the task is already in
 *   flight; we do NOT overwrite `cancelledAt`).
 * - `cancelledAt != null` → `already_cancelled`.
 * - otherwise → set `cancelledAt = now()` and return `cancelled`.
 *
 * `userId` is matched in the WHERE clause for authorization: a confirmation
 * row belongs to exactly one user, and we never want a cross-user cancel.
 *
 * @see Requirements 5.6, 6.1, 6.3, 7.5
 */
export async function markConfirmationCancelled(
  confirmationId: string,
  userId: string,
): Promise<{ status: MarkCancelledStatus }> {
  return pgDb.transaction(async (tx) => {
    const [row] = await tx
      .select({
        cancelledAt: ChiefConfirmationIdempotencyTable.cancelledAt,
        enqueuedAt: ChiefConfirmationIdempotencyTable.enqueuedAt,
      })
      .from(ChiefConfirmationIdempotencyTable)
      .where(
        and(
          eq(
            ChiefConfirmationIdempotencyTable.confirmationId,
            confirmationId,
          ),
          eq(ChiefConfirmationIdempotencyTable.userId, userId),
        ),
      )
      .limit(1)
      .for("update");

    if (!row) {
      return { status: "not_found" as const };
    }

    if (row.enqueuedAt !== null) {
      return { status: "already_enqueued" as const };
    }

    if (row.cancelledAt !== null) {
      return { status: "already_cancelled" as const };
    }

    await tx
      .update(ChiefConfirmationIdempotencyTable)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(
            ChiefConfirmationIdempotencyTable.confirmationId,
            confirmationId,
          ),
          eq(ChiefConfirmationIdempotencyTable.userId, userId),
        ),
      );

    return { status: "cancelled" as const };
  });
}

export type MarkEnqueuedStatus =
  | "enqueued"
  | "already_enqueued"
  | "cancelled"
  | "not_found";

/**
 * Atomically mark a confirmation row as enqueued.
 *
 * Same locking strategy as {@link markConfirmationCancelled}. The
 * terminal-state checks ensure that a cancelled confirmation can never
 * be enqueued (Requirement 5.7), and that two parallel enqueue attempts
 * resolve to a single winning task id (Requirement 6.4):
 *
 * - `cancelledAt != null` → `cancelled` (must NOT enqueue).
 * - `enqueuedAt != null` → `already_enqueued` with the previously stored
 *   `taskId` (callers should fetch the existing task instead of inserting).
 * - otherwise → set `enqueuedAt = now()`, persist `taskId`, return
 *   `enqueued`.
 *
 * @see Requirements 5.7, 5.8, 5.11, 6.1, 6.3, 6.4, 6.5, 6.6, 6.8
 */
export async function markConfirmationEnqueued(
  confirmationId: string,
  taskId: string,
): Promise<{ status: MarkEnqueuedStatus; taskId?: string }> {
  return pgDb.transaction(async (tx) => {
    const [row] = await tx
      .select({
        cancelledAt: ChiefConfirmationIdempotencyTable.cancelledAt,
        enqueuedAt: ChiefConfirmationIdempotencyTable.enqueuedAt,
        taskId: ChiefConfirmationIdempotencyTable.taskId,
      })
      .from(ChiefConfirmationIdempotencyTable)
      .where(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
      )
      .limit(1)
      .for("update");

    if (!row) {
      return { status: "not_found" as const };
    }

    if (row.cancelledAt !== null) {
      return { status: "cancelled" as const };
    }

    if (row.enqueuedAt !== null) {
      return {
        status: "already_enqueued" as const,
        taskId: row.taskId,
      };
    }

    await tx
      .update(ChiefConfirmationIdempotencyTable)
      .set({ enqueuedAt: new Date(), taskId })
      .where(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
      );

    return { status: "enqueued" as const, taskId };
  });
}

export type MarkFailedStatus =
  | "failed"
  | "already_enqueued"
  | "already_cancelled"
  | "already_failed"
  | "not_found";

/**
 * Atomically mark a confirmation row as failed (non-retryable enqueue
 * failure or `rate_limited`).
 *
 * Used by the Inngest handler `chiefExecuteConfirmation` when
 * `enqueueAgenTeamTask` either throws a non-retryable error (DB invariant
 * violation, schema corruption, etc.) or returns `status: "rate_limited"`
 * — both of which leave the cancellation window in a terminal state that
 * the user must acknowledge via the chat UI (Requirement 13.6).
 *
 * Same locking strategy as {@link markConfirmationCancelled} /
 * {@link markConfirmationEnqueued}. Terminal-state checks ensure that:
 *
 * - `enqueuedAt != null` → `already_enqueued` (the task already won; we do
 *   NOT overwrite the success row even if a parallel attempt errored).
 * - `cancelledAt != null` → `already_cancelled` (the user beat us to the
 *   cancel; the failure is moot).
 * - `failedAt != null` → `already_failed` (idempotent retry of the same
 *   failure record).
 * - otherwise → set `failedAt = now()`, `failureStatus`, `failureMessage`
 *   and return `failed`.
 *
 * @see Requirement 13.6
 */
export async function markConfirmationFailed(
  confirmationId: string,
  args: {
    failureStatus: "error" | "rate_limited";
    failureMessage?: string | null;
  },
): Promise<{ status: MarkFailedStatus }> {
  return pgDb.transaction(async (tx) => {
    const [row] = await tx
      .select({
        cancelledAt: ChiefConfirmationIdempotencyTable.cancelledAt,
        enqueuedAt: ChiefConfirmationIdempotencyTable.enqueuedAt,
        failedAt: ChiefConfirmationIdempotencyTable.failedAt,
      })
      .from(ChiefConfirmationIdempotencyTable)
      .where(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
      )
      .limit(1)
      .for("update");

    if (!row) {
      return { status: "not_found" as const };
    }

    if (row.enqueuedAt !== null) {
      return { status: "already_enqueued" as const };
    }

    if (row.cancelledAt !== null) {
      return { status: "already_cancelled" as const };
    }

    if (row.failedAt !== null) {
      return { status: "already_failed" as const };
    }

    await tx
      .update(ChiefConfirmationIdempotencyTable)
      .set({
        failedAt: new Date(),
        failureStatus: args.failureStatus,
        failureMessage: args.failureMessage ?? null,
      })
      .where(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
      );

    return { status: "failed" as const };
  });
}

/**
 * Load the raw idempotency row for `(confirmationId, userId)`.
 *
 * Used by the cancel/status endpoints to inspect the row state without
 * mutating it. Returns `null` when the row does not exist or belongs to a
 * different user.
 *
 * @see Requirements 5.10, 6.1, 7.5
 */
export async function loadConfirmationRow(
  confirmationId: string,
  userId: string,
): Promise<ChiefConfirmationIdempotencyEntity | null> {
  const [row] = await pgDb
    .select()
    .from(ChiefConfirmationIdempotencyTable)
    .where(
      and(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
        eq(ChiefConfirmationIdempotencyTable.userId, userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Load only the frozen `pendingConfirmation` snapshot for a given
 * `confirmationId`. Used by the Inngest execute step to re-build the
 * `enqueueAgenTeamTask` payload from the snapshot rather than recomputing
 * it from a possibly-mutated `BriefLedger` (Requirement 7.3).
 *
 * Validates the persisted JSON via `PendingConfirmationSchema.safeParse()`;
 * a failed parse is logged and treated as missing snapshot so that the
 * caller falls back to the safe path (skip enqueue) instead of executing
 * with a corrupted payload.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.5
 */
export async function loadPendingConfirmationSnapshot(
  confirmationId: string,
  userId: string,
): Promise<PendingConfirmation | null> {
  const [row] = await pgDb
    .select({ snapshot: ChiefConfirmationIdempotencyTable.snapshot })
    .from(ChiefConfirmationIdempotencyTable)
    .where(
      and(
        eq(
          ChiefConfirmationIdempotencyTable.confirmationId,
          confirmationId,
        ),
        eq(ChiefConfirmationIdempotencyTable.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const parsed = PendingConfirmationSchema.safeParse(row.snapshot);
  if (!parsed.success) {
    logger.warn(
      "[chief.persistence] loadPendingConfirmationSnapshot: snapshot failed schema validation",
      {
        confirmationId,
        userId,
        issues: parsed.error.issues,
      },
    );
    return null;
  }

  return parsed.data;
}
