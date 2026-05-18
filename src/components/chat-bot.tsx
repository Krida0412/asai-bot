"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PromptInput from "./prompt-input";
import clsx from "clsx";
import { appStore } from "@/app/store";
import { cn, createDebounce, generateUUID, truncateString } from "lib/utils";
import { ErrorMessage, PreviewMessage } from "./message";
import { ChatGreeting } from "./chat-greeting";
import { InteractiveOverlay } from "./interactive-overlay";
import { CountdownCard } from "@/components/agen-team/countdown-card";

import { useShallow } from "zustand/shallow";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  TextUIPart,
  UIMessage,
  ToolUIPart,
  getToolName,
} from "ai";

import { safe } from "ts-safe";
import { mutate } from "swr";
import {
  ChatApiSchemaRequestBody,
  ChatAttachment,
  ChatModel,
} from "app-types/chat";
import { useToRef } from "@/hooks/use-latest";
import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { Button } from "ui/button";
import { deleteThreadAction } from "@/app/api/chat/actions";
import { useRouter } from "next/navigation";
import { ArrowDown, Loader, FilePlus, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { useTranslations } from "next-intl";
import { Think } from "ui/think";
import { useGenerateThreadTitle } from "@/hooks/queries/use-generate-thread-title";
import dynamic from "next/dynamic";
import { useMounted } from "@/hooks/use-mounted";
import { getStorageManager } from "lib/browser-stroage";
import { AnimatePresence, motion } from "framer-motion";
import { useThreadFileUploader } from "@/hooks/use-thread-file-uploader";
import { useFileDragOverlay } from "@/hooks/use-file-drag-overlay";

type Props = {
  threadId: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel?: string;
  apiEndpoint?: string;
  /** When set to "agen-team-chief", enables task-creation detection */
  mode?: "default" | "agen-team-chief";
  /** Override the default input placeholder text */
  inputPlaceholder?: string;
  /** Called when createAgenTeamTask tool returns a taskId */
  onAgenTeamTaskCreated?: (taskId: string) => void;
};

const LightRays = dynamic(() => import("ui/light-rays"), {
  ssr: false,
});

const Particles = dynamic(() => import("ui/particles"), {
  ssr: false,
});

const debounce = createDebounce();
const AGEN_TEAM_HIDDEN_TOOL_NAMES = [
  "askUserInput",
  "createAgenTeamTask",
  "agenTeamCancellationWindow",
] as const;

const firstTimeStorage = getStorageManager("IS_FIRST");
const isFirstTime = firstTimeStorage.get() ?? true;
firstTimeStorage.set(false);

export default function ChatBot({
  threadId,
  initialMessages,
  apiEndpoint,
  mode,
  inputPlaceholder,
  onAgenTeamTaskCreated,
}: Props) {
  const isAgenTeamChief = mode === "agen-team-chief";
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { uploadFiles } = useThreadFileUploader(threadId);
  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      await uploadFiles(files);
    },
    [uploadFiles],
  );
  const { isDragging } = useFileDragOverlay({
    onDropFiles: handleFileDrop,
  });

  const [
    appStoreMutate,
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    threadList,
    threadMentions,
    pendingThreadMention,
    threadImageToolModel,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.chatModel,
      state.toolChoice,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.threadList,
      state.threadMentions,
      state.pendingThreadMention,
      state.threadImageToolModel,
    ]),
  );

  const generateTitle = useGenerateThreadTitle({
    threadId,
  });

  const [showParticles, setShowParticles] = useState(isFirstTime);

  const initialMessageIds = useMemo(
    () => new Set(initialMessages.map((m) => m.id)),
    [],
  );
  const [dismissedToolCalls, setDismissedToolCalls] = useState<Set<string>>(
    new Set(),
  );

  const onFinish = useCallback(() => {
    if (isAgenTeamChief) return;

    const messages = latestRef.current.messages;
    const prevThread = latestRef.current.threadList.find(
      (v) => v.id === threadId,
    );
    const isNewThread =
      !prevThread?.title &&
      messages.filter((v) => v.role === "user" || v.role === "assistant")
        .length < 3;
    if (isNewThread) {
      const part = messages
        .slice(0, 2)
        .flatMap((m) =>
          m.parts
            .filter((v) => v.type === "text")
            .map(
              (p) =>
                `${m.role}: ${truncateString((p as TextUIPart).text, 500)}`,
            ),
        );
      if (part.length > 0) {
        generateTitle(part.join("\n\n"));
      }
    } else if (latestRef.current.threadList[0]?.id !== threadId) {
      mutate("/api/thread");
    }
  }, [isAgenTeamChief]);

  const [input, setInput] = useState("");

  const {
    messages,
    status,
    setMessages,
    addToolResult: _addToolResult,
    error,
    sendMessage,
    stop,
  } = useChat({
    id: threadId,
    ...(isAgenTeamChief
      ? {}
      : { sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls }),
    transport: new DefaultChatTransport({
      api: apiEndpoint ?? "/api/chat",
      prepareSendMessagesRequest: ({ messages, body, id }) => {
        if (
          !isAgenTeamChief &&
          window.location.pathname !== `/chat/${threadId}`
        ) {
          console.log("replace-state");
          window.history.replaceState({}, "", `/chat/${threadId}`);
        }
        const lastMessage = messages.at(-1)!;
        // Filter out UI-only parts (e.g., source-url) so the model doesn't receive unknown parts
        const attachments: ChatAttachment[] = lastMessage.parts.reduce(
          (acc: ChatAttachment[], part: any) => {
            if (part?.type === "file") {
              acc.push({
                type: "file",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.filename,
              });
            } else if (part?.type === "source-url") {
              acc.push({
                type: "source-url",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.title,
              });
            }
            return acc;
          },
          [],
        );

        const sanitizedLastMessage = {
          ...lastMessage,
          parts: lastMessage.parts.filter((p: any) => p?.type !== "source-url"),
        } as typeof lastMessage;
        const sanitizedMessages = messages.map((message) => ({
          ...message,
          parts: message.parts.filter((p: any) => p?.type !== "source-url"),
        }));
        const hasFilePart = lastMessage.parts?.some(
          (p) => (p as any)?.type === "file",
        );

        const requestBody: ChatApiSchemaRequestBody & {
          messages?: typeof sanitizedMessages;
        } = {
          ...body,
          id,
          chatModel:
            (body as { model: ChatModel })?.model ?? latestRef.current.model,
          toolChoice: latestRef.current.toolChoice,
          allowedAppDefaultToolkit:
            latestRef.current.mentions?.length || hasFilePart
              ? []
              : latestRef.current.allowedAppDefaultToolkit,
          allowedMcpServers: latestRef.current.mentions?.length
            ? {}
            : latestRef.current.allowedMcpServers,
          mentions: latestRef.current.mentions,
          message: sanitizedLastMessage,
          imageTool: {
            model: latestRef.current.threadImageToolModel[threadId],
          },
          attachments,
          ...(isAgenTeamChief ? { messages: sanitizedMessages } : {}),
        };
        return { body: requestBody };
      },
    }),
    messages: initialMessages,
    generateId: generateUUID,
    experimental_throttle: 100,
    onFinish,
  });
  const [isDeleteThreadPopupOpen, setIsDeleteThreadPopupOpen] = useState(false);

  const addToolResult = useCallback(
    async (result: Parameters<typeof _addToolResult>[0]) => {
      await _addToolResult(result);
      // sendMessage();
    },
    [_addToolResult],
  );

  const mounted = useMounted();

  const latestRef = useToRef({
    toolChoice,
    model,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    messages,
    threadList,
    threadId,
    mentions: threadMentions[threadId],
    threadImageToolModel,
  });

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  const emptyMessage = useMemo(
    () => messages.length === 0 && !error,
    [messages.length, error],
  );

  const isInitialThreadEntry = useMemo(
    () =>
      initialMessages.length > 0 &&
      initialMessages.at(-1)?.id === messages.at(-1)?.id,
    [messages],
  );

  const isPendingToolCall = useMemo(() => {
    if (status != "ready") return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role != "assistant") return false;
    const lastPart = lastMessage.parts.at(-1);
    if (!lastPart) return false;
    if (!isToolUIPart(lastPart)) return false;
    if (lastPart.state.startsWith("output")) return false;
    return true;
  }, [status, messages]);

  const activeAskUserInput = useMemo(() => {
    if (status !== "ready") return null;
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") return null;

    // Reverse search for the latest askUserInput that requires input
    const askToolPart = lastMessage.parts
      .slice()
      .reverse()
      .find(
        (part): part is ToolUIPart =>
          isToolUIPart(part) &&
          getToolName(part) === "askUserInput" &&
          part.state === "input-available",
      );

    if (!askToolPart) return null;
    if (initialMessageIds.has(lastMessage.id)) return null;
    if (dismissedToolCalls.has(askToolPart.toolCallId)) return null;
    return askToolPart;
  }, [status, messages, initialMessageIds, dismissedToolCalls]);

  useEffect(() => {
    if (input.trim().length > 0 && activeAskUserInput) {
      setDismissedToolCalls(
        (prev) => new Set([...prev, activeAskUserInput.toolCallId]),
      );
    }
  }, [input, activeAskUserInput]);

  useEffect(() => {
    if (activeAskUserInput) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeAskUserInput]);

  const handleAskUserInputSubmit = useCallback(
    async (toolCallId: string, answer: Record<string, string | string[]>) => {
      try {
        setDismissedToolCalls((prev) => new Set([...prev, toolCallId]));
        await addToolResult({ toolCallId, output: answer } as any);

        if (isAgenTeamChief) {
          await sendMessage();
        }
      } catch (_err) {
        if (typeof toast !== "undefined" && toast.error) {
          toast.error("Gagal mengirim jawaban. Periksa koneksi internet.");
        }
      }
    },
    [addToolResult, isAgenTeamChief, sendMessage],
  );

  const space = useMemo(() => {
    if (!isLoading || error) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role == "user") return "think";
    const lastPart = lastMessage?.parts.at(-1);
    if (!lastPart) return "think";
    const secondPart = lastMessage?.parts[1];
    if (secondPart?.type == "text" && secondPart.text.length == 0)
      return "think";
    if (lastPart?.type == "step-start") {
      return lastMessage?.parts.length == 1 ? "think" : "space";
    }
    return false;
  }, [isLoading, messages.at(-1)]);

  const particle = useMemo(() => {
    return (
      <AnimatePresence>
        {showParticles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 5 }}
          >
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <LightRays />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <Particles particleCount={400} particleBaseSize={10} />
            </div>

            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-t from-background to-50% to-transparent z-20" />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-l from-background to-20% to-transparent z-20" />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-r from-background to-20% to-transparent z-20" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }, [showParticles]);

  const handleFocus = useCallback(() => {
    setShowParticles(false);
    debounce(() => setShowParticles(true), 60000);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAtBottom(isScrollAtBottom);
    handleFocus();
  }, [handleFocus]);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // ─── Agen Team: detect createAgenTeamTask tool result ─────────
  const handledAgenTaskToolCalls = useRef(new Set<string>());
  const onAgenTeamTaskCreatedRef = useToRef(onAgenTeamTaskCreated);

  // ─── Agen Team v3: cancellation window + task-error gating ────
  // Track the most recent cancellation window dispatched by Scope_Router.
  // Populated from `agenTeamCancellationWindow` tool outputs (task 9.2 +
  // 11.1) so the UI can render `CountdownCard` while the 30-second window
  // is open and `readyForStory` has not yet flipped (Requirement 5.5,
  // 5.10, 13.1, 13.2, 13.3, 13.4).
  const [activeCountdown, setActiveCountdown] = useState<{
    confirmationId: string;
    scheduledExecuteAt: string;
    durationSeconds: number;
    status: "armed" | "cancelled" | "enqueued";
  } | null>(null);
  // Track the most recent enqueue-error tool output so we render an inline
  // error card instead of opening StoryMode (Requirement 13.6).
  const [taskError, setTaskError] = useState<{
    toolCallId: string;
    message: string;
    status?: string;
  } | null>(null);
  const countdownPollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAgenTeamChief) return;

    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") return;

    // Walk every tool part on the latest assistant message in order so the
    // "newest" payload wins (e.g. an `enqueued` status overrides a prior
    // `armed`).
    let nextCountdown: typeof activeCountdown = null;
    let nextError: typeof taskError = null;

    for (const part of lastMessage.parts) {
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);

      if (
        toolName === "agenTeamCancellationWindow" &&
        part.state.startsWith("output")
      ) {
        const output = part.output as
          | {
              confirmationId?: string;
              scheduledExecuteAt?: string;
              durationSeconds?: number;
              status?: "armed" | "cancelled" | "enqueued";
            }
          | undefined;
        if (
          output?.confirmationId &&
          output?.scheduledExecuteAt &&
          output?.status
        ) {
          nextCountdown = {
            confirmationId: output.confirmationId,
            scheduledExecuteAt: output.scheduledExecuteAt,
            durationSeconds: output.durationSeconds ?? 30,
            status: output.status,
          };
        }
        continue;
      }

      if (
        toolName === "createAgenTeamTask" &&
        part.state.startsWith("output")
      ) {
        const output = part.output as
          | {
              taskId?: string | null;
              status?: string;
              readyForStory?: boolean;
              message?: string;
            }
          | undefined;
        if (!output) continue;

        if (output.readyForStory === true && output.taskId) {
          // StoryMode is about to open; clear any prior error and the
          // cancellation window for the same confirmation (Requirement
          // 5.10, 13.5).
          nextError = null;
          if (
            nextCountdown &&
            output.taskId === nextCountdown.confirmationId
          ) {
            nextCountdown = null;
          }
          continue;
        }

        if (output.readyForStory === false) {
          // Skip status values that just mean "still gathering brief" —
          // those are handled by askUserInput / director_text and should
          // not surface as a hard error (Requirement 13.6).
          if (
            output.status === "needs_clarification" ||
            output.status === "needs_topic" ||
            output.status === "publish_disabled" ||
            output.status === "cancelled" ||
            output.status === "queued"
          ) {
            continue;
          }
          nextError = {
            toolCallId: part.toolCallId,
            message:
              output.message ??
              "Gagal mengirim brief ke pipeline. Coba lagi atau batalkan.",
            status: output.status,
          };
        }
      }
    }

    // Hide the countdown card once the user has cancelled — the UI now
    // shows the cancellation acknowledgement instead.
    if (nextCountdown?.status === "cancelled") {
      nextCountdown = null;
    }

    setActiveCountdown((prev) => {
      if (prev === nextCountdown) return prev;
      if (
        prev &&
        nextCountdown &&
        prev.confirmationId === nextCountdown.confirmationId &&
        prev.scheduledExecuteAt === nextCountdown.scheduledExecuteAt &&
        prev.durationSeconds === nextCountdown.durationSeconds &&
        prev.status === nextCountdown.status
      ) {
        return prev;
      }
      return nextCountdown;
    });

    setTaskError((prev) => {
      if (prev === nextError) return prev;
      if (
        prev &&
        nextError &&
        prev.toolCallId === nextError.toolCallId &&
        prev.message === nextError.message &&
        prev.status === nextError.status
      ) {
        return prev;
      }
      return nextError;
    });
  }, [messages, isAgenTeamChief]);

  useEffect(() => {
    if (!isAgenTeamChief || !activeCountdown) return;
    if (activeCountdown.status !== "armed") return;

    const pollKey = `${activeCountdown.confirmationId}:${activeCountdown.scheduledExecuteAt}`;
    countdownPollKeyRef.current = pollKey;
    let stopped = false;
    let retryTimer: number | undefined;

    const pollConfirmationStatus = async () => {
      if (stopped || countdownPollKeyRef.current !== pollKey) return;

      try {
        const response = await fetch(
          `/api/agen-team/chief-chat/confirmation-status?confirmationId=${encodeURIComponent(
            activeCountdown.confirmationId,
          )}`,
          { method: "GET" },
        );

        if (!response.ok) {
          retryTimer = window.setTimeout(pollConfirmationStatus, 2000);
          return;
        }

        const result = (await response.json()) as
          | { status: "armed" }
          | { status: "cancelled" }
          | { status: "enqueued"; taskId?: string }
          | { status: "error" | "rate_limited"; message?: string };

        if (stopped || countdownPollKeyRef.current !== pollKey) return;

        if (result.status === "enqueued" && result.taskId) {
          setActiveCountdown((prev) =>
            prev?.confirmationId === activeCountdown.confirmationId
              ? null
              : prev,
          );
          onAgenTeamTaskCreatedRef.current?.(result.taskId);
          return;
        }

        if (result.status === "cancelled") {
          setActiveCountdown((prev) =>
            prev?.confirmationId === activeCountdown.confirmationId
              ? { ...prev, status: "cancelled" }
              : prev,
          );
          return;
        }

        if (result.status === "error" || result.status === "rate_limited") {
          setActiveCountdown((prev) =>
            prev?.confirmationId === activeCountdown.confirmationId
              ? null
              : prev,
          );
          setTaskError({
            toolCallId: `confirmation-status:${activeCountdown.confirmationId}`,
            status: result.status,
            message:
              result.message ??
              (result.status === "rate_limited"
                ? "Terlalu banyak task berjalan. Selesaikan task lain lalu coba lagi."
                : "Gagal mengirim brief ke pipeline. Coba lagi atau batalkan."),
          });
          return;
        }

        // Still armed: Inngest may be waking up or inserting the task.
        // Keep the countdown card visible and poll lightly until the row
        // reaches a terminal state.
        retryTimer = window.setTimeout(pollConfirmationStatus, 2000);
      } catch {
        if (!stopped) {
          retryTimer = window.setTimeout(pollConfirmationStatus, 2000);
        }
      }
    };

    const msUntilScheduled = Math.max(
      0,
      Date.parse(activeCountdown.scheduledExecuteAt) - Date.now(),
    );
    const firstTimer = window.setTimeout(
      pollConfirmationStatus,
      Number.isFinite(msUntilScheduled) ? msUntilScheduled : 0,
    );

    return () => {
      stopped = true;
      window.clearTimeout(firstTimer);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [activeCountdown, isAgenTeamChief, onAgenTeamTaskCreatedRef]);

  useEffect(() => {
    if (!isAgenTeamChief) return;

    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") return;

    for (const part of lastMessage.parts) {
      if (
        isToolUIPart(part) &&
        getToolName(part) === "createAgenTeamTask" &&
        part.state.startsWith("output")
      ) {
        if (handledAgenTaskToolCalls.current.has(part.toolCallId)) continue;

        const output = part.output as
          | {
              taskId?: string | null;
              status?: string;
              readyForStory?: boolean;
            }
          | undefined;
        if (!output?.taskId) continue;
        // Gate: only open StoryMode when readyForStory is `true`. While
        // `agenTeamCancellationWindow` is armed Scope_Router has not yet
        // emitted a `readyForStory: true` payload (Requirement 13.1,
        // 13.2, 13.3).
        if (output.readyForStory !== true) continue;
        if (
          output.status === "needs_clarification" ||
          output.status === "needs_topic" ||
          output.status === "publish_disabled" ||
          output.status === "cancelled"
        ) {
          continue;
        }

        handledAgenTaskToolCalls.current.add(part.toolCallId);
        onAgenTeamTaskCreatedRef.current?.(output.taskId);
      }
    }
  }, [messages, isAgenTeamChief]);

  useEffect(() => {
    if (!isAgenTeamChief) {
      appStoreMutate({ currentThreadId: threadId });
    }
    return () => {
      if (!isAgenTeamChief) {
        appStoreMutate({ currentThreadId: null });
      }
    };
  }, [threadId, isAgenTeamChief]);

  useEffect(() => {
    if (pendingThreadMention && threadId) {
      appStoreMutate((prev) => ({
        threadMentions: {
          ...prev.threadMentions,
          [threadId]: [pendingThreadMention],
        },
        pendingThreadMention: undefined,
      }));
    }
  }, [pendingThreadMention, threadId, appStoreMutate]);

  useEffect(() => {
    if (isInitialThreadEntry)
      containerRef.current?.scrollTo({
        top: containerRef.current?.scrollHeight,
        behavior: "instant",
      });
  }, [isInitialThreadEntry]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const messages = latestRef.current.messages;
      if (messages.length === 0) return;
      const isLastMessageCopy = isShortcutEvent(e, Shortcuts.lastMessageCopy);
      const isDeleteThread = isShortcutEvent(e, Shortcuts.deleteThread);
      if (!isDeleteThread && !isLastMessageCopy) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLastMessageCopy) {
        const lastMessage = messages.at(-1);
        const lastMessageText = lastMessage!.parts
          .filter((part): part is TextUIPart => part.type == "text")
          ?.at(-1)?.text;
        if (!lastMessageText) return;
        navigator.clipboard.writeText(lastMessageText);
        toast.success("Last message copied to clipboard");
      }
      if (isDeleteThread) {
        setIsDeleteThreadPopupOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (mounted) {
      handleFocus();
    }
  }, [input]);

  return (
    <>
      {!isAgenTeamChief && particle}
      <div
        className={cn(
          emptyMessage && "justify-center pb-24",
          "flex flex-col min-w-0 relative h-full z-40",
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl px-6 py-5 bg-background/80 shadow-xl border border-border flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <FilePlus className="size-6" />
              </div>
              <span className="text-sm text-muted-foreground">
                Drop files to upload
              </span>
            </div>
          </div>
        )}
        {emptyMessage ? (
          <ChatGreeting />
        ) : (
          <>
            <div
              className={
                "flex flex-col gap-2 overflow-y-auto py-6 z-10 [scrollbar-gutter:stable_both-edges]"
              }
              ref={containerRef}
              onScroll={handleScroll}
            >
              {messages.map((message, index) => {
                const isLastMessage = messages.length - 1 === index;
                return (
                  <PreviewMessage
                    threadId={threadId}
                    messageIndex={index}
                    prevMessage={messages[index - 1]}
                    key={message.id}
                    message={message}
                    status={status}
                    addToolResult={addToolResult}
                    isLoading={isLoading || isPendingToolCall}
                    isLastMessage={isLastMessage}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                    hiddenToolNames={
                      isAgenTeamChief
                        ? [...AGEN_TEAM_HIDDEN_TOOL_NAMES]
                        : undefined
                    }
                    className={
                      isLastMessage &&
                      message.role != "user" &&
                      !space &&
                      message.parts.length > 1
                        ? "min-h-[calc(55dvh-40px)]"
                        : ""
                    }
                  />
                );
              })}
              {space && (
                <>
                  <div className="w-full mx-auto max-w-3xl px-6 relative">
                    <div className={space == "space" ? "opacity-0" : ""}>
                      <Think />
                    </div>
                  </div>
                  <div className="min-h-[calc(55dvh-56px)]" />
                </>
              )}

              {error && <ErrorMessage error={error} />}
              {isAgenTeamChief && activeCountdown && (
                <div className="mx-auto w-full max-w-3xl px-6">
                  <CountdownCard
                    confirmationId={activeCountdown.confirmationId}
                    scheduledExecuteAt={activeCountdown.scheduledExecuteAt}
                    durationSeconds={activeCountdown.durationSeconds}
                    status={activeCountdown.status}
                    onCancelled={() =>
                      setActiveCountdown((prev) =>
                        prev?.confirmationId === activeCountdown.confirmationId
                          ? null
                          : prev,
                      )
                    }
                  />
                </div>
              )}
              {isAgenTeamChief && taskError && (
                <div className="mx-auto w-full max-w-3xl px-6">
                  <div
                    role="alert"
                    data-testid="agen-team-task-error"
                    className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-destructive">
                          Gagal mengirim brief
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {taskError.message}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setTaskError(null)}
                      >
                        Tutup
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTaskError(null);
                          void sendMessage({
                            role: "user",
                            parts: [
                              {
                                type: "text",
                                text: "Coba kirim ulang brief ke pipeline.",
                              },
                            ],
                          });
                        }}
                      >
                        Coba lagi
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="min-w-0 min-h-52" />
            </div>
          </>
        )}

        <div
          className={clsx(
            messages.length && "absolute bottom-14",
            "w-full z-10",
          )}
        >
          <div className="max-w-3xl mx-auto relative flex justify-center items-center -top-2">
            <ScrollToBottomButton
              show={!isAtBottom && messages.length > 0}
              onClick={scrollToBottom}
            />
          </div>

          <PromptInput
            input={input}
            threadId={threadId}
            sendMessage={sendMessage}
            setInput={setInput}
            isLoading={isLoading || isPendingToolCall}
            onStop={stop}
            onFocus={isFirstTime ? undefined : handleFocus}
            {...(inputPlaceholder ? { placeholder: inputPlaceholder } : {})}
          />
        </div>
        {!isAgenTeamChief && (
          <DeleteThreadPopup
            threadId={threadId}
            onClose={() => setIsDeleteThreadPopupOpen(false)}
            open={isDeleteThreadPopupOpen}
          />
        )}
        {activeAskUserInput && (
          <InteractiveOverlay
            data={
              (activeAskUserInput as any).args ||
              (activeAskUserInput as any).input
            }
            toolCallId={activeAskUserInput.toolCallId}
            onDismiss={() =>
              setDismissedToolCalls(
                (prev) => new Set([...prev, activeAskUserInput.toolCallId]),
              )
            }
            onSubmit={handleAskUserInputSubmit}
          />
        )}
      </div>
    </>
  );
}

function DeleteThreadPopup({
  threadId,
  onClose,
  open,
}: { threadId: string; onClose: () => void; open: boolean }) {
  const t = useTranslations();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const handleDelete = useCallback(() => {
    setIsDeleting(true);
    safe(() => deleteThreadAction(threadId))
      .watch(() => setIsDeleting(false))
      .ifOk(() => {
        toast.success(t("Chat.Thread.threadDeleted"));
        router.push("/");
      })
      .ifFail(() => toast.error(t("Chat.Thread.failedToDeleteThread")))
      .watch(() => onClose());
  }, [threadId, router]);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Chat.Thread.deleteChat")}</DialogTitle>
          <DialogDescription>
            {t("Chat.Thread.areYouSureYouWantToDeleteThisChatThread")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("Common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} autoFocus>
            {t("Common.delete")}
            {isDeleting && <Loader className="size-3.5 ml-2 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScrollToBottomButtonProps {
  show: boolean;
  onClick: () => void;
  className?: string;
}

function ScrollToBottomButton({
  show,
  onClick,
  className,
}: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={className}
        >
          <Button
            onClick={onClick}
            className="shadow-lg backdrop-blur-sm border transition-colors"
            size="icon"
            variant="ghost"
          >
            <ArrowDown />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
