"use client";

import { cn } from "@/lib/utils";

const AGENT_CONFIG: Record<string, { emoji: string; color: string }> = {
  "Chief Agent": { emoji: "👔", color: "text-yellow-500" },
  "Research Analyst": { emoji: "🔍", color: "text-blue-400" },
  "QA Auditor": { emoji: "🛡️", color: "text-cyan-400" },
  "Kepala Intelijen": { emoji: "🧠", color: "text-indigo-400" },
  "Content Writer": { emoji: "✍️", color: "text-amber-400" },
  "Social Media Specialist": { emoji: "📱", color: "text-pink-400" },
  "Kepala Marketing": { emoji: "📊", color: "text-orange-400" },
  "Finance Agent": { emoji: "💰", color: "text-purple-400" },
  Sistem: { emoji: "⚙️", color: "text-slate-400" },
};

export interface ForumMessageData {
  id: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  timestamp: string;
  type: "progress" | "handoff" | "done" | "error";
  division: string;
  percentage: number;
  stageLabel?: string;
  vibe?: string;
}

interface ForumMessageProps {
  message: ForumMessageData;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ForumMessage({ message }: ForumMessageProps) {
  const config = AGENT_CONFIG[message.fromAgent] ?? AGENT_CONFIG.Sistem;

  return (
    <article
      className={cn(
        "mb-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300",
        message.type === "done" && "border-green-500/30 bg-green-500/5",
        message.type === "error" && "border-red-500/30 bg-red-500/5",
      )}
    >
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-lg">
          <span className="leading-none">{config.emoji}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={cn("font-semibold", config.color)}>
              {message.fromAgent}
            </span>
            <span className="text-muted-foreground">ke</span>
            <span className="font-medium text-foreground/80">
              {message.toAgent}
            </span>
            {message.stageLabel ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {message.stageLabel}
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatTime(message.timestamp)}
            </span>
          </div>

          {message.vibe ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {message.vibe}
            </div>
          ) : null}

          <div className="mt-3 rounded-2xl bg-muted/70 px-4 py-3">
            <p className="text-sm leading-relaxed text-foreground">
              {message.message}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className={cn(
                  "h-1.5 rounded-full bg-primary transition-all duration-300",
                  message.type === "done" && "bg-green-500",
                  message.type === "error" && "bg-red-500",
                )}
                style={{
                  width: `${Math.min(Math.max(message.percentage, 0), 100)}%`,
                }}
              />
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {Math.round(message.percentage)}%
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
