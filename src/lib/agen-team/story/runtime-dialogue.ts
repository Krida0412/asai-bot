import type { StoryRoomId } from "./story-scenes";
import { AGENT_PERSONAS, type AgentPersonaId } from "./personas";

export interface RuntimeDialogueInput {
  sceneId: string;
  roomId: StoryRoomId;
  speakerId: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  mentions?: AgentPersonaId[];
  message: string;
}

export interface RuntimeDialogueResult {
  message: string;
  targetIds: AgentPersonaId[];
  mentions: AgentPersonaId[];
  meta: {
    speakerId: AgentPersonaId;
    targetIds: AgentPersonaId[];
    mentionIds: AgentPersonaId[];
  };
}

function unique(values: AgentPersonaId[] = []) {
  return [...new Set(values)];
}

export function mentionToken(personaId: AgentPersonaId) {
  if (personaId === "system") return "";
  return `@${AGENT_PERSONAS[personaId].shortName}`;
}

export function ensureVisibleMentions(
  message: string,
  targetIds?: AgentPersonaId[],
  mentions?: AgentPersonaId[],
) {
  const ids = unique([...(targetIds ?? []), ...(mentions ?? [])]).filter(
    (id) => id !== "system",
  );
  const missing = ids
    .map(mentionToken)
    .filter((token) => token && !message.includes(token));
  if (missing.length === 0) return message;
  return `${missing.join(", ")} ${message}`.trim();
}

export function sanitizeRuntimeDialogueMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

export function normalizeRuntimeAgentDialogue(
  input: RuntimeDialogueInput,
): RuntimeDialogueResult {
  const targetIds = unique(input.targetIds ?? []);
  const mentions = unique(input.mentions ?? targetIds);
  const message = ensureVisibleMentions(
    sanitizeRuntimeDialogueMessage(input.message),
    targetIds,
    mentions,
  );
  return {
    message,
    targetIds,
    mentions,
    meta: {
      speakerId: input.speakerId,
      targetIds,
      mentionIds: mentions,
    },
  };
}
