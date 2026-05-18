"use client";

import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";

interface PlaybackControlsProps {
  isPlaying: boolean;
  sceneIndex: number;
  totalScenes: number;
  onTogglePlay: () => void;
  onSkipScene: () => void;
  onReplayEpisode: () => void;
}

export function PlaybackControls({
  isPlaying,
  sceneIndex,
  totalScenes,
  onTogglePlay,
  onSkipScene,
  onReplayEpisode,
}: PlaybackControlsProps) {
  const isLastScene = sceneIndex >= totalScenes - 1;

  return (
    <div className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background/86 px-3 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-6 sm:py-3">
      <div className="text-xs text-muted-foreground">
        Scene{" "}
        <span className="font-semibold text-foreground">{sceneIndex + 1}</span>
        <span> / {Math.max(totalScenes, 1)}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full px-3"
          onClick={onReplayEpisode}
        >
          <RotateCcw className="size-4" />
          <span className="hidden sm:inline">Ulang dari awal</span>
          <span className="sm:hidden">Ulang</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full px-3"
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full px-3"
          onClick={onSkipScene}
          disabled={isLastScene}
        >
          <SkipForward className="size-4" />
          Skip
        </Button>
      </div>
    </div>
  );
}
