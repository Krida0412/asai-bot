'use client';

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from 'lib/utils';

interface RankingInputProps {
  options: string[];
  onChange: (ranked: string[]) => void;
}

export function RankingInput({ options, onChange }: RankingInputProps) {
  const [ranked, setRanked] = useState<string[]>([...options]);
  const [dragging, setDragging] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragging(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragging === null || dragging === index) return;

    const newRanked = [...ranked];
    const item = newRanked.splice(dragging, 1)[0];
    newRanked.splice(index, 0, item);
    setRanked(newRanked);
    setDragging(index);
    onChange(newRanked);
  }

  function handleDragEnd() {
    setDragging(null);
  }

  return (
    <div className="space-y-1.5 w-full">
      <p className="mb-2 text-xs text-muted-foreground">Drag to rank by priority</p>
      {ranked.map((option, index) => (
        <div
          key={option}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={cn(
            "flex cursor-grab items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm transition-all",
            dragging === index ? "scale-[1.02] border-primary shadow-sm opacity-90 z-10" : "border-border hover:bg-muted"
          )}
        >
          <span className="text-xs font-bold text-primary tabular-nums shrink-0">{index + 1}</span>
          <span className="flex-1 text-card-foreground select-none overflow-hidden text-ellipsis whitespace-nowrap">{option}</span>
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
        </div>
      ))}
    </div>
  );
}
