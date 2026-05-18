/**
 * Frontend persona config for the native 3-agent Agen Team runtime.
 */
import type { AgentPersonaId, RoomId, StoryScene } from "./types";

export const AGENT_PERSONAS: Record<
  AgentPersonaId,
  {
    personaId: AgentPersonaId;
    backendRole: string;
    displayName: string;
    shortName: string;
    title: string;
    level: string;
    gender: string;
    division: string;
  }
> = {
  chief: {
    personaId: "chief",
    backendRole: "Chief Agent",
    displayName: "Pak Arga",
    shortName: "Pak Arga",
    title: "Chief Agent",
    level: "chief",
    gender: "male",
    division: "chief",
  },
  intelgen: {
    personaId: "intelgen",
    backendRole: "Intelgen Agent",
    displayName: "Bu Rani",
    shortName: "Bu Rani",
    title: "Intelgen Agent",
    level: "lead",
    gender: "female",
    division: "intelligence",
  },
  marketing: {
    personaId: "marketing",
    backendRole: "Marketing Agent",
    displayName: "Pak Bima",
    shortName: "Pak Bima",
    title: "Marketing Agent",
    level: "lead",
    gender: "male",
    division: "marketing",
  },
  system: {
    personaId: "system",
    backendRole: "Sistem",
    displayName: "Sistem",
    shortName: "Sistem",
    title: "System",
    level: "system",
    gender: "neutral",
    division: "system",
  },
};

const ROOM_SCENES: Record<RoomId, StoryScene> = {
  war_room: {
    sceneId: "war_room",
    roomId: "war_room",
    title: "War Room",
    subtitle: "Melihat sebagai Pak Arga",
    povAgentId: "chief",
  },
  intelligence: {
    sceneId: "intelligence",
    roomId: "intelligence",
    title: "Intelgen",
    subtitle: "Melihat sebagai Bu Rani",
    povAgentId: "intelgen",
  },
  marketing: {
    sceneId: "marketing",
    roomId: "marketing",
    title: "Marketing",
    subtitle: "Melihat sebagai Pak Bima",
    povAgentId: "marketing",
  },
};

const ROLE_TO_PERSONA: Record<string, AgentPersonaId> = {
  "Chief Agent": "chief",
  "Kepala Intelijen": "intelgen",
  "Intelgen Agent": "intelgen",
  "Research Analyst": "intelgen",
  "QA Auditor": "intelgen",
  "Kepala Marketing": "marketing",
  "Marketing Agent": "marketing",
  "Content Writer": "marketing",
  "Social Media Specialist": "marketing",
  "Finance Agent": "system",
  "Operations System": "system",
  Sistem: "system",
};

export function getPersonaByBackendRole(role?: string): AgentPersonaId {
  if (!role) return "system";
  return ROLE_TO_PERSONA[role] ?? "system";
}

export function getAddressName(
  _speakerId: AgentPersonaId,
  targetId: AgentPersonaId,
): string {
  if (targetId === "system") return "";
  return AGENT_PERSONAS[targetId].shortName;
}

export function getSceneForRoom(roomId: RoomId): StoryScene {
  return ROOM_SCENES[roomId];
}

export function getPovAgentForRoom(roomId: RoomId): AgentPersonaId {
  return ROOM_SCENES[roomId].povAgentId;
}
