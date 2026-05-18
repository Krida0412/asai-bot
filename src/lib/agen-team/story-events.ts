export type StoryEventKind =
  | "scene_start"
  | "agent_message"
  | "narrator"
  | "typing"
  | "system"
  | "receipt"
  | "result_card"
  | "scene_end";

export type StoryRoomId =
  | "war_room"
  | "intelligence"
  | "marketing"
  | "operations";

export type StoryPovAgentId = "chief" | "intelgen" | "marketing";

export interface StoryEvent {
  type: "story";
  kind: StoryEventKind;
  taskId: string;
  roomId: StoryRoomId;
  sceneId: string;
  povAgentId: StoryPovAgentId;
  speakerId?: string;
  targetIds?: string[];
  message?: string;
  timestamp: string;
  mentions?: string[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;
}

export function isStoryEvent(value: unknown): value is StoryEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: unknown }).type === "story" &&
      "kind" in value &&
      "roomId" in value,
  );
}

export function getStoryStageName(kind: StoryEventKind) {
  return `story:${kind}` as const;
}
