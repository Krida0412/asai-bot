"use client";

/**
 * @deprecated Agentic Chief v3 uses `src/components/chat-bot.tsx` in
 * `agen-team-chief` mode plus `/api/agen-team/chief-chat`. This legacy
 * component is retained only for dev/reference cleanup and must not be
 * imported by active `src/app` routes.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, generateUUID } from "@/lib/utils";
import { Rocket, SendHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";

interface ChiefChatProps {
  onTaskCreated: (taskId: string) => void;
  disabled?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "chief";
  text: string;
}

interface PendingTaskPayload {
  intent_type: string;
  topic: string;
}

interface ChiefResponse {
  message_text: string;
  options?: string[];
  requires_action?: boolean;
  metadata?: PendingTaskPayload;
}

async function postJSON<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Permintaan ke Chief gagal.");
  }

  return response.json();
}

export function ChiefChat({ onTaskCreated, disabled = false }: ChiefChatProps) {
  const sessionIdRef = useRef(generateUUID());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateUUID(),
      role: "chief",
      text: "Siap. Ceritakan tugasnya, nanti saya bagi ke tim dan kita masuk ke mode cerita.",
    },
  ]);
  const [options, setOptions] = useState<string[]>([]);
  const [pendingTask, setPendingTask] = useState<PendingTaskPayload | null>(
    null,
  );

  const visibleMessages = useMemo(() => messages.slice(-5), [messages]);

  const sendMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || disabled || isLoading) {
      return;
    }

    setIsLoading(true);
    setInput("");
    setPendingTask(null);

    setMessages((prev) => [
      ...prev,
      { id: generateUUID(), role: "user", text: trimmed },
    ]);

    try {
      const response = await postJSON<ChiefResponse>("/api/agen-team", {
        action: "chief_message",
        message: trimmed,
        session_id: sessionIdRef.current,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "chief",
          text: response.message_text,
        },
      ]);
      setOptions(response.options ?? []);
      if (response.requires_action && response.metadata) {
        setPendingTask(response.metadata);
      } else {
        setPendingTask(null);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "chief",
          text:
            error instanceof Error
              ? error.message
              : "Chief sedang tidak bisa dijangkau.",
        },
      ]);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const runTask = async () => {
    if (!pendingTask || disabled || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const taskId = generateUUID();
      const response = await postJSON<{
        task_id: string;
        status: string;
      }>("/api/agen-team", {
        action: "run_task",
        task_payload: {
          task_id: taskId,
          intent_type: pendingTask.intent_type,
          topic: pendingTask.topic,
          max_total_tokens: 12000,
          max_budget_usd: 0.35,
          max_sources: 8,
          photo_requirements: {
            needs_photo: false,
          },
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "chief",
          text: "Siap, saya teruskan ke tim. Kita masuk ke mode cerita.",
        },
      ]);
      setPendingTask(null);
      setOptions([]);
      onTaskCreated(response.task_id ?? taskId);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "chief",
          text:
            error instanceof Error
              ? error.message
              : "Gagal membuat tugas baru.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-primary/10 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">👤 Pak Arga</div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-4">
          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[90%] rounded-xl px-3 py-2 text-sm shadow-sm",
                message.role === "chief"
                  ? "bg-muted text-foreground"
                  : "ml-auto bg-primary text-primary-foreground",
              )}
            >
              {message.text}
            </div>
          ))}

          {pendingTask ? (
            <Button
              type="button"
              className="w-full rounded-lg"
              onClick={runTask}
              disabled={disabled || isLoading}
            >
              <Rocket />
              Kerjakan Sekarang
            </Button>
          ) : null}

          {options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => sendMessage(option)}
                  disabled={disabled || isLoading}
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ketik instruksi ke Pak Arga..."
            disabled={disabled || isLoading}
            className="h-10"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-lg"
            disabled={disabled || isLoading || !input.trim()}
          >
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </section>
  );
}
