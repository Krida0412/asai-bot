/**
 * Chief Chat (Pak Arga) cancel endpoint — task 8.2.
 *
 * Atomically marks a pending confirmation row cancelled when the user
 * clicks "Batalkan publish" inside the 30-second cancellation window.
 *
 * Contract:
 * - Auth: session user must be the owner of the confirmation row.
 *   Ownership is enforced inside `markConfirmationCancelled` (the
 *   `WHERE confirmation_id = $1 AND user_id = $2` clause runs inside a
 *   `SELECT ... FOR UPDATE` transaction so the Inngest handler racing to
 *   enqueue sees a consistent state).
 * - The actual update (`UPDATE chief_confirmation_idempotency SET
 *   cancelled_at = now() WHERE confirmation_id = $1 AND enqueued_at IS
 *   NULL`) is encapsulated by `markConfirmationCancelled` from task 1.5;
 *   this route is a thin HTTP wrapper.
 *
 * Response shape:
 *   { ok: true, status: "cancelled" | "already_cancelled" | "already_enqueued" }
 *   { ok: false, status: "not_found" } with HTTP 404 when the row is
 *   missing (or owned by another user).
 *
 * @see ../../../../../.kiro/specs/agentic-chief-v3/requirements.md Requirements 5.6, 5.7, 6.1
 */
import { getSession } from "auth/server";
import { markConfirmationCancelled } from "@/lib/agen-team/chief/persistence";
import { z } from "zod";

const RequestSchema = z.object({
  confirmationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    const json = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid request body" },
        { status: 400 },
      );
    }

    const result = await markConfirmationCancelled(
      parsed.data.confirmationId,
      userId,
    );

    if (result.status === "not_found") {
      return Response.json(
        { ok: false, status: "not_found" as const },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    console.error("[chief-chat/cancel]", error);
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}
