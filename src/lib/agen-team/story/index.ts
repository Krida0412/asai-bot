/**
 * Story orchestration barrel export.
 */
export {
  AGENT_PERSONAS,
  getPersona,
  getPersonaByBackendRole,
  getDisplayName,
  getShortName,
  isHead,
  isStaff,
  isSystem,
} from "./personas";
export type {
  AgentPersonaId,
  AgentPersona,
  AgentLevel,
  AgentGender,
  AgentDivision,
} from "./personas";

export { STORY_SCENES } from "./story-scenes";
export type {
  StorySceneId,
  StorySceneDef,
  StoryRoomId,
} from "./story-scenes";

export { TASK_STORY_ROUTES, getStoryRoute } from "./task-story-routes";
export type { IntentType } from "./task-story-routes";

export { getStoryCopy, getSpeakerFromBeatId } from "./story-copy";
export type { BeatId, StoryCopyContext } from "./story-copy";

export { getAddressName, getRelationshipTone } from "./relationships";
export type { RelationshipTone, RelationshipContext } from "./relationships";

export { applyPersonaStyle, pickVariant } from "./story-style";
export type { StyleContext } from "./story-style";

export {
  ensureVisibleMentions,
  mentionToken,
  normalizeRuntimeAgentDialogue,
  sanitizeRuntimeDialogueMessage,
} from "./runtime-dialogue";
export type {
  RuntimeDialogueInput,
  RuntimeDialogueResult,
} from "./runtime-dialogue";

export type { StoryBeat } from "./story-beats";
export {
  WAR_ROOM_BRIEF_BEATS,
  WAR_ROOM_BRIEF_OPS_BEATS,
  INTELLIGENCE_BEFORE_BEATS,
  INTELLIGENCE_AFTER_RESEARCH_BEATS,
  INTELLIGENCE_BEFORE_QA_BEATS,
  INTELLIGENCE_AFTER_QA_BEATS,
  INTELLIGENCE_SYNTHESIS_BEATS,
  INTELLIGENCE_PHOTO_BEATS,
  WAR_ROOM_HANDOFF_BEATS,
  MARKETING_BEFORE_BEATS,
  MARKETING_AFTER_WRITER_BEATS,
  MARKETING_BEFORE_SOCIAL_BEATS,
  MARKETING_AFTER_SOCIAL_BEATS,
  MARKETING_WRAP_BEATS,
  MARKETING_SCHEDULE_BEATS,
  WAR_ROOM_FINAL_MARKETING_BEATS,
  WAR_ROOM_FINAL_INTEL_ONLY_BEATS,
  WAR_ROOM_FINAL_OPS_BEATS,
  WAR_ROOM_FINAL_CANCEL_BEATS,
} from "./story-beats";

export {
  emitStoryBeat,
  emitWarRoomBrief,
  emitIntelligenceOpen,
  emitResearchTyping,
  emitResearchDone,
  emitQABefore,
  emitQATyping,
  emitQADone,
  emitIntelligenceClose,
  emitIntelRevisionRequest,
  emitWarRoomHandoff,
  emitMarketingOpen,
  emitChiefCheckpoint,
  emitResearchStart,
  emitWriterTyping,
  emitWriterDone,
  emitWriterStart,
  emitMarketingPrePublishDecision,
  emitSocialBefore,
  emitSocialTyping,
  emitSocialUploadStart,
  emitSocialDone,
  emitMarketingClose,
  emitWarRoomFinal,
  emitReceipt,
  emitStoryError,
  clearBeatKeys,
} from "./story-orchestrator";
export type {
  StoryContext,
  EmitStoryParams,
} from "./story-orchestrator";
