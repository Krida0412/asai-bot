"use client";

import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { AGENT_PERSONAS } from "./personas";
import type { CinematicScene, StoryScene, AgentPersonaId } from "./types";

interface SceneHeaderProps {
  scene: StoryScene | CinematicScene;
  isStreaming: boolean;
  isDone: boolean;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;

const roleColors: Record<string, string> = {
  chief: "bg-slate-500/30 text-slate-300",
  intelgen: "bg-blue-500/25 text-blue-400",
  marketing: "bg-purple-500/25 text-purple-400",
  system: "bg-slate-500/30 text-slate-300",
};

function getRoomInitial(title: string) {
  return title
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getUniqueAgents(scene: StoryScene | CinematicScene): AgentPersonaId[] {
  if (!("items" in scene)) return [];
  const seen = new Set<AgentPersonaId>();
  for (const item of scene.items) {
    if (item.speakerId && item.speakerId !== "system") {
      seen.add(item.speakerId);
    }
  }
  return Array.from(seen);
}

export function SceneHeader({ scene, isStreaming, isDone }: SceneHeaderProps) {
  const persona = AGENT_PERSONAS[scene.povAgentId];
  const agents = getUniqueAgents(scene);
  const visibleAgents = agents.slice(0, 4);
  const overflow = agents.length - 4;

  return (
    <motion.div
      key={scene.sceneId}
      initial={{ opacity: 0.72, y: -10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.48, ease: smoothEase }}
      className="sticky top-0 z-20 border-b border-border/70 bg-background/88 px-4 py-3 backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
        <motion.div
          key={scene.title}
          initial={{ scale: 0.92, opacity: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: smoothEase }}
          className="flex size-11 items-center justify-center rounded-full border border-border/70 bg-primary/10 text-sm font-semibold text-primary shadow-sm"
        >
          {getRoomInitial(scene.title)}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {scene.title}
            </h2>
            <Badge
              variant="outline"
              className="rounded-full border-border bg-background/80 px-2.5 text-[11px]"
            >
              {isStreaming
                ? "Tim sedang bekerja..."
                : isDone
                  ? "Cerita selesai"
                  : "Menunggu update"}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {scene.subtitle} · POV {persona.displayName}
          </p>
        </div>

        {/* Agent Roster Avatars */}
        {visibleAgents.length > 0 && (
          <div className="hidden items-center sm:flex">
            <div className="flex -space-x-2">
              {visibleAgents.map((agentId, i) => {
                const p = AGENT_PERSONAS[agentId];
                const color = roleColors[agentId] ?? roleColors.system;
                return (
                  <motion.div
                    key={agentId}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.3,
                      ease: smoothEase,
                      delay: i * 0.05,
                    }}
                    title={`${p.displayName} · ${p.title}`}
                    className={`flex size-7 items-center justify-center rounded-full border border-border/50 text-[10px] font-semibold shadow-sm ${color}`}
                  >
                    {p.displayName.slice(0, 1)}
                  </motion.div>
                );
              })}
              {overflow > 0 && (
                <div className="flex size-7 items-center justify-center rounded-full border border-border/50 bg-muted/30 text-[10px] font-medium text-muted-foreground shadow-sm">
                  +{overflow}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
