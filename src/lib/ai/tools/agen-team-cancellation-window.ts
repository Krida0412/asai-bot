import { tool } from "ai";
import { z } from "zod";

/**
 * AI SDK tool for the Agen Team Chief cancellation window (30 detik).
 *
 * Schema-only registration. The Chief Chat endpoint
 * (`src/app/api/agen-team/chief-chat/route.ts`) emits this tool's payload via
 * `dataStream.write({ type: "tool-input-available", toolName:
 * "agenTeamCancellationWindow", input })` and the corresponding
 * `tool-output-available` from `Scope_Router` after a user confirms a brief.
 * The 30 second window between confirmation and enqueue is rendered by the
 * client (`CountdownCard` in `interactive-overlay.tsx`) so the user can press
 * "Batalkan publish" before the task is enqueued.
 *
 * Why a tool registration at all:
 * - Provides a typed contract shared between server emission and client
 *   rendering, mirroring the schema-only pattern used by
 *   `createAgenTeamTaskTool` (see `create-agen-team-task.ts`).
 * - Keeps the server emission and the client-side narrowing
 *   (`getToolName(part) === "agenTeamCancellationWindow"`) consistent.
 *
 * Important:
 * - This tool is NOT invoked by the LLM. The LLM director runs with
 *   `toolChoice: "none"` and the cancellation window is dispatched
 *   deterministically by `Scope_Router` (Requirement 13.4 / NFR3).
 * - This is distinct from `createAgenTeamTask`. Receiving this tool output
 *   means a window is armed; the client must NOT open StoryMode until a
 *   subsequent `createAgenTeamTask` tool output arrives with
 *   `readyForStory: true` (Requirement 5.3, 13.4).
 *
 * Output payload contract (mirrored by `inputSchema` below for typing only):
 * - `confirmationId`     : stable id for the pending confirmation.
 * - `scheduledExecuteAt` : ISO datetime when enqueue will fire.
 * - `durationSeconds`    : always `30` for v3.
 * - `status`             : `"armed"` while the window is open,
 *                          `"cancelled"` if the user cancelled in time,
 *                          `"enqueued"` after the task has been enqueued.
 *
 * Validates: Requirement 5.3 (countdown card render contract),
 *            Requirement 13.4 (StoryMode gating during the window).
 */
export const agenTeamCancellationWindowTool = tool({
  description:
    "Internal: do not call directly. Schema-only contract for the 30-second cancellation window dispatched by Scope_Router after a user confirms a brief. Used by the client to render CountdownCard and gate StoryMode.",
  inputSchema: z.object({
    confirmationId: z.string().uuid(),
    scheduledExecuteAt: z.string().datetime(),
    durationSeconds: z.literal(30),
    status: z.enum(["armed", "cancelled", "enqueued"]),
  }),
});
