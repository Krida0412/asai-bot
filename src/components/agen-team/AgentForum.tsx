"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ForumMessage, type ForumMessageData } from "./ForumMessage";

export type ForumMessage = ForumMessageData;

interface AgentForumProps {
  messages: ForumMessage[];
  isActive: boolean;
}

export function AgentForum({ messages, isActive }: AgentForumProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [showTyping, setShowTyping] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!isActive) {
      setShowTyping(false);
      return;
    }

    setShowTyping(false);
    const timeout = window.setTimeout(() => {
      setShowTyping(true);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [isActive, messages.length]);

  const empty = useMemo(() => messages.length === 0, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">
          Forum Diskusi Agen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bukan log progres. Ini ruang obrolan kerja tim agen saat tugas
          berjalan.
        </p>
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-4 sm:px-5">
          {empty ? (
            <div className="flex flex-1 items-center justify-center py-16 text-center">
              <div className="max-w-md rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 shadow-sm">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Belum ada aktivitas. Kirim instruksi ke Chief untuk memulai.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ForumMessage key={message.id} message={message} />
            ))
          )}

          {showTyping ? (
            <div className="mt-2 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-base">...</span>
                <span>Tim masih ngobrol dan nyusun langkah berikutnya.</span>
              </div>
              <div className="mt-3 flex gap-1.5">
                <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:0ms]" />
                <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
