"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatRoomScene } from "./ChatRoomScene";
import { PlaybackControls } from "./PlaybackControls";
import { SceneHeader } from "./SceneHeader";
import { SceneTransition } from "./SceneTransition";
import type { CinematicScene, StoryItem } from "./types";

interface StoryPlayerProps {
  episodeKey: string;
  scenes: CinematicScene[];
  isStreaming: boolean;
  isDone: boolean;
  taskId?: string | null;
  onRetry?: (taskId: string) => void | Promise<void>;
  onApprove?: (taskId: string) => void | Promise<void>;
  onOpenResults?: () => void;
}

type PlayerPhase = "transition" | "scene";

const TRANSITION_DURATION_MS = 4200;
const FIRST_ITEM_DELAY_MS = 520;
const AFTER_SCENE_HOLD_MS = 2400;

function getItemDelayMs(item?: StoryItem) {
  const message = item?.message ?? "";
  const length = message.length || 42;

  if (item?.kind === "narrator" || item?.kind === "scene_intro") {
    return Math.min(Math.max(length * 24 + 1800, 3600), 5600);
  }

  if (item?.kind === "result_card") {
    return 4200;
  }

  if (item?.kind === "receipt" || item?.kind === "system") {
    return 1800;
  }

  return Math.min(Math.max(length * 20 + 1100, 1700), 3800);
}

export function StoryPlayer({
  episodeKey,
  scenes,
  isStreaming,
  isDone,
  taskId,
  onRetry,
  onApprove,
  onOpenResults,
}: StoryPlayerProps) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>("scene");
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const previousSceneKeyRef = useRef<string | null>(null);

  const safeScenes = useMemo(() => scenes.filter(Boolean), [scenes]);
  const activeScene = safeScenes[Math.min(sceneIndex, safeScenes.length - 1)];

  useEffect(() => {
    previousSceneKeyRef.current = null;
    setSceneIndex(0);
    setVisibleCount(0);
    setPhase("scene");
    setIsPlaying(true);
  }, [episodeKey]);

  useEffect(() => {
    if (sceneIndex > safeScenes.length - 1) {
      setSceneIndex(Math.max(safeScenes.length - 1, 0));
    }
  }, [safeScenes.length, sceneIndex]);

  useEffect(() => {
    if (!activeScene) return;

    const sceneKey = activeScene.id;
    if (previousSceneKeyRef.current === sceneKey) {
      return;
    }

    previousSceneKeyRef.current = sceneKey;
    setVisibleCount(
      activeScene.transitionBefore ? 0 : Math.min(1, activeScene.items.length),
    );
    setPhase(activeScene.transitionBefore ? "transition" : "scene");
  }, [activeScene]);

  useEffect(() => {
    if (!isPlaying || !activeScene || phase !== "transition") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPhase("scene");
    }, TRANSITION_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [activeScene, isPlaying, phase]);

  useEffect(() => {
    if (!isPlaying || !activeScene || phase !== "scene") {
      return;
    }

    if (visibleCount === 0 && activeScene.items.length > 0) {
      const timeout = window.setTimeout(() => {
        setVisibleCount(1);
      }, FIRST_ITEM_DELAY_MS);

      return () => window.clearTimeout(timeout);
    }

    if (visibleCount < activeScene.items.length) {
      const currentItem = activeScene.items[visibleCount];
      const timeout = window.setTimeout(() => {
        setVisibleCount((count) =>
          Math.min(count + 1, activeScene.items.length),
        );
      }, getItemDelayMs(currentItem));

      return () => window.clearTimeout(timeout);
    }

    if (sceneIndex < safeScenes.length - 1) {
      const timeout = window.setTimeout(() => {
        setSceneIndex((index) => Math.min(index + 1, safeScenes.length - 1));
      }, AFTER_SCENE_HOLD_MS);

      return () => window.clearTimeout(timeout);
    }
  }, [
    activeScene,
    isPlaying,
    phase,
    safeScenes.length,
    sceneIndex,
    visibleCount,
  ]);

  const replayEpisode = () => {
    previousSceneKeyRef.current = null;
    setSceneIndex(0);
    setVisibleCount(0);
    setPhase("scene");
    setIsPlaying(true);
  };

  const skipScene = () => {
    setSceneIndex((index) => Math.min(index + 1, safeScenes.length - 1));
    setIsPlaying(true);
  };

  const togglePlay = () => setIsPlaying((value) => !value);

  if (!activeScene) {
    if (isDone) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Task tidak dapat dilanjutkan atau telah dibatalkan.
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Pak Arga sedang menyiapkan tim...
      </div>
    );
  }

  const showTransition = phase === "transition" && activeScene.transitionBefore;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SceneHeader
        scene={activeScene}
        isStreaming={isStreaming}
        isDone={isDone}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {showTransition ? (
            <SceneTransition
              key={`transition-${activeScene.id}`}
              message={activeScene.transitionBefore ?? ""}
            />
          ) : (
            <ChatRoomScene
              key={`scene-${activeScene.id}`}
              scene={activeScene}
              visibleCount={visibleCount}
              taskId={taskId}
              onRetry={onRetry}
              onApprove={onApprove}
              onOpenResults={onOpenResults}
            />
          )}
        </AnimatePresence>
      </div>

      <PlaybackControls
        isPlaying={isPlaying}
        sceneIndex={sceneIndex}
        totalScenes={safeScenes.length}
        onTogglePlay={togglePlay}
        onSkipScene={skipScene}
        onReplayEpisode={replayEpisode}
      />
    </div>
  );
}
