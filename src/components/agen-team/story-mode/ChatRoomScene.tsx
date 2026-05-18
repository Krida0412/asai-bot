"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { DecisionCard } from "./DecisionCard";
import { FinalResultCard } from "./FinalResultCard";
import { NarratorCard } from "./NarratorCard";
import { ReceiptCard } from "./ReceiptCard";
import { StoryBubble } from "./StoryBubble";
import type { CinematicScene, StoryItem } from "./types";

interface ChatRoomSceneProps {
  scene: CinematicScene;
  visibleCount: number;
  taskId?: string | null;
  onRetry?: (taskId: string) => void | Promise<void>;
  onApprove?: (taskId: string) => void | Promise<void>;
  onOpenResults?: () => void;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;

function renderItem(
  item: StoryItem,
  index: number,
  taskId?: string | null,
  onRetry?: (taskId: string) => void | Promise<void>,
  onApprove?: (taskId: string) => void | Promise<void>,
  onOpenResults?: () => void,
) {
  const delay = Math.min(index * 0.045, 0.18);

  if (
    item.kind === "scene_intro" ||
    item.kind === "narrator" ||
    item.kind === "system"
  ) {
    return (
      <NarratorCard key={item.id} message={item.message ?? ""} delay={delay} />
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

  if (item.kind === "decision_card" || item.kind === "checkpoint_card") {
    return <DecisionCard key={item.id} item={item} delay={delay} />;
  }

  return <StoryBubble key={item.id} item={item} delay={delay} />;
}

export function ChatRoomScene({
  scene,
  visibleCount,
  taskId,
  onRetry,
  onApprove,
  onOpenResults,
}: ChatRoomSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const visibleItems = scene.items.slice(0, visibleCount);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ top: 0, behavior: "auto" });
  }, [scene.id]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: visibleItems.length <= 1 ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scene.id, visibleItems.length]);

  return (
    <motion.div
      key={scene.id}
      initial={{ opacity: 0, y: 22, scale: 0.992, filter: "blur(5px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, scale: 0.992, filter: "blur(5px)" }}
      transition={{ duration: 0.62, ease: smoothEase }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent),radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.14)_1px,transparent_0)] bg-[length:auto,24px_24px]"
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0.75 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0.65 }}
        transition={{ duration: 0.58, ease: smoothEase }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background/72"
      />

      <div
        ref={viewportRef}
        className="relative z-10 min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-6"
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-3 pb-2 sm:gap-4 sm:pb-3">
          <AnimatePresence initial={false}>
            {visibleItems.map((item, index) =>
              renderItem(
                item,
                index,
                taskId,
                onRetry,
                onApprove,
                onOpenResults,
              ),
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
