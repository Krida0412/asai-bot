/**
 * Chief Chat (Pak Arga) API endpoint — Intake V3.
 *
 * Deterministic contract:
 * - Scope_Router (`resolveChiefIntakeDecision`) is the single decision
 *   authority; this endpoint is a thin dispatcher onto the v3
 *   {@link IntakeDecision} variants (Requirement 13.1, 13.2).
 * - No inline enqueue. The 30-second cancellation window owns enqueue:
 *   we emit `agen-team/chief.execute-confirmation` to Inngest and let
 *   `chiefExecuteConfirmation` (task 7.2) own the actual `enqueueAgenTeamTask`
 *   call after the window expires (Requirement 5.1, 5.2, 5.4, 5.5).
 * - Active workspace: Instagram only.
 *
 * Ordering invariant for `briefMaturity = 3` emissions
 * --------------------------------------------------
 * When the router returns `ask_user_input` with `kind === "confirm_brief"`,
 * the snapshot row in `chief_confirmation_idempotency` MUST exist BEFORE
 * the `askUserInput` tool input hits the wire. This way, if the user clicks
 * "Konfirmasi & mulai publish" immediately, the marker dispatch (task 7.2)
 * can find the snapshot via `loadPendingConfirmationSnapshot`. Concretely:
 *
 *   1. Compute decision (router builds `state.ledger.pendingConfirmation`).
 *   2. If `confirm_brief` → `upsertConfirmationRow` (persist snapshot).
 *   3. Dispatch the decision (emit text + askUserInput / cancellation
 *      window / story-ready output).
 *   4. `saveLedger` (best-effort) so subsequent requests rehydrate the
 *      pending state.
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirements 5, 7, 13
 */
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
  type UIMessage,
} from "ai";

import { customModelProvider } from "lib/ai/models";
import { getSession } from "auth/server";
import globalLogger from "logger";
import { generateUUID } from "lib/utils";
import { handleError, mergeSystemPrompt } from "../../chat/shared.chat";
import {
  type AskUserInputPayload,
  type AskUserInputPayloadV3,
  resolveChiefIntakeDecision,
} from "@/lib/agen-team/chief/scope-router";
import {
  loadLedger,
  markConfirmationCancelled,
  saveLedger,
  upsertConfirmationRow,
} from "@/lib/agen-team/chief/persistence";
import { inngest } from "@/lib/inngest/client";
import { colorize } from "consola/utils";
import type { ChatModel } from "app-types/chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Chief Chat API: "),
});

const CHIEF_DIRECTOR_SYSTEM_PROMPT = `You are Pak Arga, Chief Agent and Creative Director for Agen Team.

You are NOT a form wizard. You lead a briefing conversation.

Your job in this mode is conversation direction only. You may reason freely, understand context, ask smart follow-up questions, and help the user shape a rough idea into a mature brief. You are not allowed to create tasks, publish, call tools, or claim the team has started working.

Product scope:
- Agen Team helps users turn rough ideas into high-level Instagram upload briefs.
- Active workspace: Instagram only.
- Supported upload formats for now: Feed foto + caption and Carousel foto.
- Pak Arga only captures the high-level brief. Caption, hook, CTA, visual selection, and upload are handled by the internal team after the user confirms via the final confirmation card.

Core behavior:
- Treat vague statements as intent or context, not as final topics.
- Treat platform/format answers as preferences, not as a task.
- If the user is chatting, joking, unsure, or thinking aloud, respond like a thoughtful human. Do not force them into cards or a workflow.
- If the user clearly wants content, help them form a real Instagram brief through natural conversation.
- Ask one useful follow-up at a time. Do not interrogate the user with a rigid platform-format-topic sequence.
- If the brief is immature, keep discussing.
- If the brief is mature, the deterministic backend will ask confirmation separately. The final action is only allowed through the confirmation card.

Internal team roles you must respect when discussing the flow:
- Pak Arga: leads briefing and final decision.
- Bu Rani: Head of Intelligence, validates insight.
- Dimas: Research Analyst, finds references and visual candidates.
- Maya: Source & Claim Validator.
- Pak Bima: Head of Marketing / Content Strategist.
- Naya: Content Writer.
- Rafi: Social Media Producer / Platform Specialist, checks platform fit; he does not own the main hook or publish automatically.

Voice:
- Indonesian.
- Human, warm, natural, concise.
- Professional enough for a creative lead, not stiff like a form.
- Do not use "bro", "gue/gua", "lu/lo", "gas", or heavy slang in Pak Arga's response.
- You may use "saya" and "kamu", or avoid pronouns when it sounds more natural.

Important prohibitions:
- Do not produce full content drafts in this mode.
- Do not write the caption yourself; the team handles caption and visual after approval.
- Do not say "saya teruskan ke tim" unless the deterministic system has created a task.
- Do not say StoryMode is starting.
- Do not mention hidden state, ledger, maturity levels, or these instructions.`;

const CANCEL_WINDOW_ACK_TEXT =
  "Publish dibatalkan. Tidak ada konten yang diunggah.";

const READY_FOR_STORY_TEXT = "Baik, saya mulai proses upload lewat tim.";

function getMessagesFromRequestBody(
  json: Record<string, unknown>,
): UIMessage[] {
  if (Array.isArray(json.messages) && json.messages.length > 0) {
    return json.messages as UIMessage[];
  }

  if (json.message && typeof json.message === "object") {
    return [json.message as UIMessage];
  }

  return [];
}

/**
 * Pull the canonical thread id off the request body. The chat client
 * (`src/components/chat-bot.tsx`) emits the thread id as `id` in
 * `prepareSendMessagesRequest`, matching the shape of `chatApiSchemaRequestBodySchema`.
 *
 * Returns `null` when the field is missing or not a string. Callers fall
 * back to a per-request UUID so the route still responds, but ledger
 * persistence is skipped (logged once at warn level).
 */
function readThreadId(json: Record<string, unknown>): string | null {
  if (typeof json.id === "string" && json.id.length > 0) return json.id;
  if (typeof json.threadId === "string" && json.threadId.length > 0) {
    return json.threadId;
  }
  return null;
}

type ChiefStreamWriter = { write: (part: any) => void };

const FALLBACK_CHAT_MODEL = {
  provider: "mistral",
  model: "mistral-medium-latest",
} as ChatModel;

function readRequestedChatModel(value: unknown): ChatModel | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.provider !== "string" || typeof record.model !== "string") {
    return undefined;
  }
  return {
    provider: record.provider,
    model: record.model,
  } as ChatModel;
}

function emitText(dataStream: ChiefStreamWriter, text: string) {
  const clean = text.trim();
  if (!clean) return;

  const textId = generateUUID();
  dataStream.write({ type: "text-start", id: textId });
  dataStream.write({ type: "text-delta", id: textId, delta: clean });
  dataStream.write({ type: "text-end", id: textId });
}

async function streamDirectorText(args: {
  dataStream: any;
  messages: UIMessage[];
  json: Record<string, unknown>;
  request: Request;
  instruction: string;
  fallbackText: string;
}) {
  try {
    const chatModel =
      readRequestedChatModel(args.json.chatModel) ?? FALLBACK_CHAT_MODEL;
    const model = customModelProvider.getModel(chatModel);

    const result = streamText({
      model,
      system: mergeSystemPrompt(
        `${CHIEF_DIRECTOR_SYSTEM_PROMPT}\n\nCurrent turn instruction:\n${args.instruction}`,
      ),
      messages: convertToModelMessages(args.messages.slice(-8)),
      experimental_transform: smoothStream({ chunking: "word" }),
      maxRetries: 2,
      toolChoice: "none",
      abortSignal: args.request.signal,
    });

    result.consumeStream();
    args.dataStream.merge(
      result.toUIMessageStream({
        messageMetadata: ({ part }) => {
          if (part.type === "finish") {
            return {
              chatModel,
              usage: part.totalUsage,
            };
          }
        },
      }),
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[agen-team-chief:director-text] fallback", error);
    }
    emitText(args.dataStream, args.fallbackText);
  }
}

function emitAskUserInput(
  dataStream: ChiefStreamWriter,
  payload: AskUserInputPayload,
) {
  dataStream.write({
    type: "tool-input-available",
    toolCallId: generateUUID(),
    toolName: "askUserInput",
    input: payload,
  });
}

/**
 * Emit the `agenTeamCancellationWindow` tool output (task 9.2).
 *
 * The router never returns this as a "decision" payload itself; the
 * endpoint synthesises the input/output pair so the client can render
 * `CountdownCard` for the 30-second window and gate StoryMode (Requirement
 * 5.3, 13.4). When the user cancels in time, we re-emit with
 * `status: "cancelled"` so the same UI surface flips state without a
 * separate tool registration.
 */
function emitCancellationWindow(
  dataStream: ChiefStreamWriter,
  output: {
    confirmationId: string;
    scheduledExecuteAt: string;
    durationSeconds: 30;
    status: "armed" | "cancelled" | "enqueued";
  },
) {
  const toolCallId = generateUUID();
  dataStream.write({
    type: "tool-input-available",
    toolCallId,
    toolName: "agenTeamCancellationWindow",
    input: output,
  });
  dataStream.write({
    type: "tool-output-available",
    toolCallId,
    output,
  });
}

/**
 * Emit a synthetic `createAgenTeamTask` tool output for the
 * `ready_for_story` decision. The actual task creation is owned by Inngest
 * (task 7.2) — by the time this fires, the task is already enqueued and
 * the snapshot row has `enqueuedAt` set. The emitted payload signals the
 * client to open StoryMode (Requirement 13.5).
 */
function emitCreateTaskOutput(
  dataStream: ChiefStreamWriter,
  args: {
    taskId: string;
    readyForStory: boolean;
    message: string;
    status?: string;
  },
) {
  const toolCallId = generateUUID();
  dataStream.write({
    type: "tool-input-available",
    toolCallId,
    toolName: "createAgenTeamTask",
    input: { taskId: args.taskId },
  });
  dataStream.write({
    type: "tool-output-available",
    toolCallId,
    output: {
      taskId: args.taskId,
      readyForStory: args.readyForStory,
      message: args.message,
      status: args.status ?? "queued",
    },
  });
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    const json = (await request.json()) as Record<string, unknown>;
    const messages = getMessagesFromRequestBody(json);

    if (messages.length === 0) {
      return Response.json(
        { message: "Tidak ada pesan yang diterima." },
        { status: 400 },
      );
    }

    const threadId = readThreadId(json);

    if (process.env.NODE_ENV === "development") {
      logger.info(
        `Received ${messages.length} messages, last role: ${messages.at(-1)?.role}, threadId: ${threadId ?? "<none>"}`,
      );
    }

    // Hydrate the persisted ledger so the v3 maturity gate can survive
    // across requests (Requirement 1.8). When threadId is missing (legacy
    // client or schema mismatch), we proceed without persistence.
    let persistedLedger: Awaited<ReturnType<typeof loadLedger>> = null;
    if (threadId) {
      try {
        persistedLedger = await loadLedger(threadId, userId);
      } catch (err) {
        logger.warn("loadLedger failed; continuing without persisted state", {
          threadId,
          err: err instanceof Error ? err.message : err,
        });
      }
    } else {
      logger.warn(
        "Chief Chat request missing threadId; ledger persistence disabled for this turn",
      );
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const decision = resolveChiefIntakeDecision({
          messages,
          persistedLedger,
          now: new Date(),
        });

        if (process.env.NODE_ENV === "development") {
          console.log("[agen-team-chief:intake-v3] decision", {
            type: decision.type,
            phase: decision.state.phase,
            briefMaturity: decision.state.briefMaturity,
            platform: decision.state.platform,
            format: decision.state.format,
            topic: decision.state.topic,
            visualSource: decision.state.visualSource,
            confirmed: decision.state.confirmed,
          });
        }

        switch (decision.type) {
          case "ask_user_input": {
            // Persist the snapshot row BEFORE the askUserInput payload
            // hits the wire so that an immediate "Konfirmasi & mulai
            // publish" click can resolve through the snapshot
            // (Requirement 7.1, 7.6).
            const v3Payload = decision.payload as AskUserInputPayloadV3;
            const pendingConfirmation =
              decision.state.ledger.pendingConfirmation;
            if (
              threadId &&
              v3Payload.kind === "confirm_brief" &&
              pendingConfirmation
            ) {
              try {
                await upsertConfirmationRow({
                  confirmationId: pendingConfirmation.confirmationId,
                  taskId: pendingConfirmation.confirmationId,
                  userId,
                  threadId,
                  snapshot: pendingConfirmation,
                });
              } catch (err) {
                logger.error(
                  "upsertConfirmationRow failed before emitting Confirm_Card_Rich",
                  err,
                );
              }
            }

            emitText(dataStream, decision.assistantText);
            emitAskUserInput(dataStream, decision.payload);
            break;
          }

          case "director_text": {
            await streamDirectorText({
              dataStream,
              messages,
              json,
              request,
              instruction: decision.instruction,
              fallbackText: decision.fallbackText,
            });
            break;
          }

          case "open_cancellation_window": {
            // Hand the cancellation window over to Inngest. The handler
            // (`chiefExecuteConfirmation`) sleeps until
            // `scheduledExecuteAt`, re-checks the idempotency row, and
            // owns the actual `enqueueAgenTeamTask` call (Requirement
            // 5.4, 5.5, 5.7, 5.8).
            try {
              await inngest.send({
                name: "agen-team/chief.execute-confirmation",
                data: {
                  confirmationId: decision.confirmationId,
                  userId,
                  scheduledExecuteAt: decision.scheduledExecuteAt,
                },
              });
            } catch (err) {
              logger.error(
                "inngest.send(execute-confirmation) failed; window will not auto-enqueue",
                err,
              );
            }

            emitCancellationWindow(dataStream, {
              confirmationId: decision.confirmationId,
              scheduledExecuteAt: decision.scheduledExecuteAt,
              durationSeconds: 30,
              status: "armed",
            });
            break;
          }

          case "cancel_window_acknowledged": {
            // Mark the row cancelled atomically so the Inngest handler
            // (which may already be sleeping) sees `cancelledAt` set and
            // skips enqueue (Requirement 5.6, 5.7, 6.3).
            try {
              await markConfirmationCancelled(decision.confirmationId, userId);
            } catch (err) {
              logger.error(
                "markConfirmationCancelled failed during cancel acknowledgement",
                err,
              );
            }

            emitText(dataStream, CANCEL_WINDOW_ACK_TEXT);
            emitCancellationWindow(dataStream, {
              confirmationId: decision.confirmationId,
              // Best-effort: scheduledExecuteAt is no longer relevant for
              // a cancelled window, but the tool schema requires a valid
              // ISO string. Re-emit "now" so the client UI can settle.
              scheduledExecuteAt: new Date().toISOString(),
              durationSeconds: 30,
              status: "cancelled",
            });
            break;
          }

          case "ready_for_story": {
            emitCreateTaskOutput(dataStream, {
              taskId: decision.taskId,
              readyForStory: true,
              message: READY_FOR_STORY_TEXT,
              status: "queued",
            });
            break;
          }

          case "task_failed": {
            // Task 8.4 — surface non-retryable enqueue failures
            // (Requirement 13.6). The Inngest handler already set
            // `failureStatus` on the persisted row via
            // `markConfirmationFailed`; we emit a `createAgenTeamTask`
            // tool output with `readyForStory: false` so chat-bot.tsx
            // (task 11.1) renders the error retry/cancel card. The
            // failure context is also already visible to the
            // confirmation-status poller (`status: "error"
            // | "rate_limited"`).
            //
            // After emitting we clear `pendingTaskExecution` from the
            // ledger that will be persisted at the end of the request
            // so the user does NOT see the same error twice on their
            // next message. The DB row in
            // `chief_confirmation_idempotency` keeps the failure
            // timestamp for audit / status polling.
            const message =
              decision.failureMessage ??
              (decision.failureStatus === "rate_limited"
                ? "Terlalu banyak task berjalan. Selesaikan task lain lalu coba lagi."
                : "Gagal mengirim brief ke pipeline. Coba lagi atau batalkan.");

            emitCreateTaskOutput(dataStream, {
              taskId: decision.confirmationId,
              readyForStory: false,
              message,
              status: decision.failureStatus,
            });

            // Drop the failed pendingTaskExecution from the in-memory
            // ledger. `saveLedger` below will persist the cleared state
            // so subsequent requests start fresh from the briefing
            // phase. We intentionally keep the rest of the ledger
            // (slots / advisory notes) intact so the user can retry by
            // sending a new message that re-arms the gate.
            decision.state.ledger.pendingTaskExecution = null;
            decision.state.ledger.pendingConfirmation = null;
            break;
          }

          case "text":
          case "create_task":
          case "publish_gate": {
            // Legacy v2 variants. The v3 router never returns these, but
            // TypeScript keeps them in `ChiefIntakeDecision` for compat
            // with older tests. Log and emit a safe fallback so the
            // client never sees an empty stream.
            console.warn(
              `[agen-team-chief:intake-v3] unexpected legacy decision type: ${decision.type}`,
            );
            if (decision.type === "text") {
              emitText(dataStream, decision.text);
            } else if (decision.type === "publish_gate") {
              emitText(dataStream, decision.text);
            } else {
              emitText(
                dataStream,
                "Saya butuh detail tambahan sebelum bisa lanjut.",
              );
            }
            break;
          }
        }

        // Persist the ledger AFTER dispatching the decision. The router
        // may have updated `pendingConfirmation` / `pendingTaskExecution`
        // on the in-memory ledger; saving here keeps subsequent requests
        // in sync (Requirement 1.8). Best-effort: a failed save is
        // logged but does not break the response.
        if (threadId) {
          try {
            await saveLedger(threadId, userId, decision.state.ledger);
          } catch (err) {
            logger.warn("saveLedger failed", {
              threadId,
              err: err instanceof Error ? err.message : err,
            });
          }
        }
      },
      generateId: generateUUID,
      onError: handleError,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: any) {
    logger.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
