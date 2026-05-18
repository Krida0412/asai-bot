/**
 * Official story scene definitions.
 * Each scene represents a room-level segment of the cinematic story.
 */
import type { AgentPersonaId } from "./personas";

export type StorySceneId =
  | "war_room_brief"
  | "intelligence_work"
  | "war_room_intelligence_handoff"
  | "marketing_work"
  | "war_room_final"
  | "operations_receipt";

export type StoryRoomId =
  | "war_room"
  | "intelligence"
  | "marketing"
  | "operations";

export interface StorySceneDef {
  sceneId: StorySceneId;
  roomId: StoryRoomId;
  povAgentId: AgentPersonaId;
  title: string;
}

export const STORY_SCENES: Record<StorySceneId, StorySceneDef> = {
  war_room_brief: {
    sceneId: "war_room_brief",
    roomId: "war_room",
    povAgentId: "chief",
    title: "War Room",
  },
  intelligence_work: {
    sceneId: "intelligence_work",
    roomId: "intelligence",
    povAgentId: "intelgen",
    title: "Intelijen",
  },
  war_room_intelligence_handoff: {
    sceneId: "war_room_intelligence_handoff",
    roomId: "war_room",
    povAgentId: "chief",
    title: "War Room",
  },
  marketing_work: {
    sceneId: "marketing_work",
    roomId: "marketing",
    povAgentId: "marketing",
    title: "Marketing",
  },
  war_room_final: {
    sceneId: "war_room_final",
    roomId: "war_room",
    povAgentId: "chief",
    title: "War Room",
  },
  operations_receipt: {
    sceneId: "operations_receipt",
    roomId: "war_room",
    povAgentId: "chief",
    title: "War Room",
  },
} as const;
