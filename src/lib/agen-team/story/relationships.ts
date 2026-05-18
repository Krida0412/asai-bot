import { type AgentPersonaId, AGENT_PERSONAS } from "./personas";

export type RelationshipTone =
  | "chief_to_agent"
  | "agent_to_chief"
  | "peer_respectful"
  | "system";

export interface RelationshipContext {
  speakerId: AgentPersonaId;
  targetId: AgentPersonaId;
  roomId?: "war_room" | "intelligence" | "marketing" | "operations";
  isDirectInstruction?: boolean;
}

export function getAddressName(
  speakerId: AgentPersonaId,
  targetId: AgentPersonaId,
): string {
  if (speakerId === "system" || targetId === "system") return "";
  return AGENT_PERSONAS[targetId].shortName;
}

export function getRelationshipTone(
  speakerId: AgentPersonaId,
  targetId: AgentPersonaId,
): RelationshipTone {
  if (speakerId === "system" || targetId === "system") return "system";
  if (speakerId === "chief") return "chief_to_agent";
  if (targetId === "chief") return "agent_to_chief";
  return "peer_respectful";
}
