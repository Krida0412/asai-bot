"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { AGENT_PERSONAS, getPovAgentForRoom } from "./personas";
import type { StoryItem } from "./types";

interface StoryBubbleProps {
  item: StoryItem;
  delay?: number;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderWithMentions(message: string) {
  const parts = message.split(/(@[A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)?)/g);

  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      return (
        <strong key={`${part}-${index}`} className="font-bold">
          {part}
        </strong>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function StoryBubble({ item, delay = 0 }: StoryBubbleProps) {
  const speakerId = item.speakerId ?? "system";
  const persona = AGENT_PERSONAS[speakerId];
  const isRight = speakerId === getPovAgentForRoom(item.roomId);
  const message = item.message ?? "";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: isRight ? 22 : -22, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: isRight ? 10 : -10, y: -18, scale: 0.97 }}
      transition={{ duration: 0.42, ease: smoothEase, delay }}
      className={`relative z-10 flex ${isRight ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[82%] gap-2 sm:max-w-[72%] ${isRight ? "flex-row-reverse" : "flex-row"}`}
      >
        {!isRight ? (
          <Avatar className="mt-5 size-8 rounded-full border border-border/60 bg-muted/70 shadow-sm">
            <AvatarFallback className="rounded-full text-[11px] font-semibold text-foreground">
              {persona.displayName.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 shrink-0" />
        )}

        <div
          className={`flex min-w-0 flex-col ${isRight ? "items-end" : "items-start"}`}
        >
          <div
            className={`mb-1 px-1 text-xs text-muted-foreground ${isRight ? "text-right" : "text-left"}`}
          >
            <span className="font-medium text-foreground">
              {persona.displayName}
            </span>
            {!isRight ? (
              <span className="ml-1 opacity-75">{persona.title}</span>
            ) : null}
          </div>

          <div
            className={[
              "rounded-[22px] px-4 py-2.5 text-sm leading-[1.5] shadow-[0_12px_28px_-20px_rgba(15,23,42,0.45)]",
              isRight
                ? "rounded-br-md bg-foreground text-background"
                : "rounded-bl-md border border-border/50 bg-background/96 text-foreground",
            ].join(" ")}
          >
            {item.replyToId ? (
              <div className="mb-2 rounded-2xl bg-black/5 px-3 py-2 text-xs opacity-80">
                Menanggapi pesan sebelumnya
              </div>
            ) : null}
            <p className="whitespace-pre-wrap break-words">
              {renderWithMentions(message)}
            </p>
            {renderVerificationBadge(item)}
            {renderDecisionIndicator(item)}
            <div
              className={`mt-1.5 text-[10px] ${isRight ? "text-background/70" : "text-muted-foreground"}`}
            >
              {formatTime(item.timestamp)}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function renderVerificationBadge(item: StoryItem) {
  const verification = item.meta?.independentVerification as
    | {
        verifiedClaims?: string[];
        contradictedClaims?: string[];
        verificationSources?: string[];
      }
    | undefined;
  if (!verification) return null;

  const verified = verification.verifiedClaims?.length ?? 0;
  const contradicted = verification.contradictedClaims?.length ?? 0;
  const sources = verification.verificationSources?.length ?? 0;

  if (verified === 0 && contradicted === 0 && sources === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {verified > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          ✅ {verified} verified
        </span>
      )}
      {contradicted > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          ⚠️ {contradicted} contradicted
        </span>
      )}
      {sources > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
          🔗 {sources} independent sources
        </span>
      )}
    </div>
  );
}

function renderDecisionIndicator(item: StoryItem) {
  const decision = item.meta?.decision as string | undefined;
  if (!decision) return null;

  const isApprove = decision.startsWith("approve") || decision === "success";
  const isRevise = decision.startsWith("revise");
  const isStop = decision.startsWith("stop") || decision === "failed";

  const color = isApprove
    ? "bg-emerald-500/10 text-emerald-400"
    : isRevise
      ? "bg-amber-500/10 text-amber-400"
      : isStop
        ? "bg-red-500/10 text-red-400"
        : "bg-muted/20 text-muted-foreground";

  return (
    <div className="mt-1.5">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
      >
        {isApprove ? "✓" : isRevise ? "↻" : isStop ? "✕" : "•"}{" "}
        {decision.replace(/_/g, " ")}
      </span>
    </div>
  );
}
