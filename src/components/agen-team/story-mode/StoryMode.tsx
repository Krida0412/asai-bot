"use client";

import { useMemo } from "react";
import {
  hasUsableStorySceneContent,
  mapOutputsToCinematicScenes,
} from "./story-adapter";
import { StoryPlayer } from "./StoryPlayer";
import { TypingIndicator } from "./TypingIndicator";
import type { StageOutputLike } from "./types";

interface StoryModeProps {
  taskId?: string | null;
  outputs: StageOutputLike[];
  isStreaming: boolean;
  status?: string;
  onRetry?: (taskId: string) => void | Promise<void>;
  onApprove?: (taskId: string) => void | Promise<void>;
  onOpenResults?: () => void;
}

export function StoryMode({
  taskId,
  outputs,
  isStreaming,
  status,
  onRetry,
  onApprove,
  onOpenResults,
}: StoryModeProps) {
  const scenes = useMemo(
    () => mapOutputsToCinematicScenes(outputs, status),
    [outputs, status],
  );
  const isReady = useMemo(
    () => hasUsableStorySceneContent(outputs, status),
    [outputs, status],
  );
  const episodeKey = useMemo(() => taskId ?? "story-preview", [taskId]);

  const isDone =
    !isStreaming &&
    (status === "completed" || status === "failed" || status === "cancelled");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.16),transparent_42%),linear-gradient(to_bottom,rgba(15,23,42,0.08),transparent_34%)] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex h-[clamp(520px,76dvh,820px)] max-h-[calc(100dvh-104px)] min-h-0 w-full max-w-5xl overflow-hidden rounded-[30px] border border-border/60 bg-background/88 shadow-[0_32px_80px_-38px_rgba(15,23,42,0.5)] backdrop-blur-xl">
        {isReady ? (
          <StoryPlayer
            episodeKey={episodeKey}
            scenes={scenes}
            isStreaming={isStreaming}
            isDone={isDone}
            taskId={taskId}
            onRetry={onRetry}
            onApprove={onApprove}
            onOpenResults={onOpenResults}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center">
            <div className="max-w-md rounded-[28px] border border-border/60 bg-background/90 px-6 py-7 shadow-sm">
              <p className="text-sm font-medium text-foreground">
                Pak Arga sedang menyiapkan tim...
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                StoryMode baru akan tampil setelah percakapan tim punya scene
                yang benar-benar siap dibaca.
              </p>
            </div>
          </div>
        )}
      </div>

      {isReady && isStreaming ? <TypingIndicator /> : null}
    </div>
  );
}
