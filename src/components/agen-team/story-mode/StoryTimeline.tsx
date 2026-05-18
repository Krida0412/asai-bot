"use client";

import { motion } from "framer-motion";
import { FinalResultCard } from "./FinalResultCard";
import { NarratorCard } from "./NarratorCard";
import { ReceiptCard } from "./ReceiptCard";
import { StoryBubble } from "./StoryBubble";
import type { StoryItem } from "./types";

interface StoryTimelineProps {
  items: StoryItem[];
  taskId?: string | null;
  onRetry?: (taskId: string) => void | Promise<void>;
  onApprove?: (taskId: string) => void | Promise<void>;
  onOpenResults?: () => void;
}

export function StoryTimeline({
  items,
  taskId,
  onRetry,
  onApprove,
  onOpenResults,
}: StoryTimelineProps) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent),radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.14)_1px,transparent_0)] bg-[length:auto,24px_24px]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/15 via-transparent to-background/65" />
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6">
        {items.map((item, index) => {
          const delay = Math.min(index * 0.035, 0.18);

          if (
            item.kind === "scene_intro" ||
            item.kind === "narrator" ||
            item.kind === "system"
          ) {
            return (
              <NarratorCard
                key={item.id}
                message={item.message ?? ""}
                delay={delay}
              />
            );
          }

          if (item.kind === "receipt") {
            return <ReceiptCard key={item.id} item={item} delay={delay} />;
          }

          if (item.kind === "result_card") {
            return (
              <FinalResultCard
                key={item.id}
                item={item}
                taskId={taskId}
                onRetry={onRetry}
                onApprove={onApprove}
                onOpenResults={onOpenResults}
                delay={delay}
              />
            );
          }

          return <StoryBubble key={item.id} item={item} delay={delay} />;
        })}

        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-[320px] items-center justify-center"
          >
            <div className="max-w-md rounded-3xl border border-dashed border-border bg-card/50 px-6 py-8 text-center text-sm leading-relaxed text-muted-foreground shadow-sm">
              Pak Arga sedang menyiapkan brief untuk tim...
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
