export type RoomId = "war_room" | "intelligence" | "marketing";

export type StoryItemKind =
  | "scene_intro"
  | "agent_message"
  | "narrator"
  | "system"
  | "receipt"
  | "result_card"
  | "decision_card"
  | "checkpoint_card";

export type StoryEventKind =
  | "scene_start"
  | "agent_message"
  | "narrator"
  | "typing"
  | "system"
  | "receipt"
  | "result_card"
  | "scene_end";

export type AgentPersonaId =
  | "chief"
  | "intelgen"
  | "marketing"
  | "system";

export interface StoryScene {
  sceneId: string;
  roomId: RoomId;
  title: string;
  subtitle: string;
  povAgentId: AgentPersonaId;
}

export interface StoryItem {
  id: string;
  kind: StoryItemKind;
  sceneId: string;
  roomId: RoomId;
  speakerId?: AgentPersonaId;
  targetId?: AgentPersonaId;
  message?: string;
  timestamp?: string;
  division?: string;
  percentage?: number;
  mentions?: AgentPersonaId[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;
}

export interface CinematicScene extends StoryScene {
  id: string;
  transitionBefore?: string;
  items: StoryItem[];
}

export interface StageOutputLike {
  id?: string;
  stageName: string;
  content: unknown;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  createdAt?: string;
}

export interface StoryEventLike {
  type: "story";
  kind: StoryEventKind;
  taskId?: string;
  roomId: RoomId | "operations";
  sceneId: string;
  povAgentId: AgentPersonaId;
  speakerId?: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  message?: string;
  timestamp?: string;
  ts?: string;
  mentions?: AgentPersonaId[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;

  /**
   * Legacy-compatible optional fields.
   * These keep page-level live event unions type-safe while the app supports
   * both new `story:*` events and old `progress:*` events.
   */
  division?: string;
  msg?: string;
  pct?: number;
  fromAgent?: string;
  toAgent?: string;
  error?: string;
  result?: unknown;
}

export interface SSEEventLike {
  type?: string;
  kind?: StoryEventKind;
  division?: string;
  msg?: string;
  pct?: number;
  ts?: string;
  timestamp?: string;
  fromAgent?: string;
  toAgent?: string;
  error?: string;
  result?: unknown;
  roomId?: RoomId | "operations";
  sceneId?: string;
  povAgentId?: AgentPersonaId;
  speakerId?: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  message?: string;
  mentions?: AgentPersonaId[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;
}
