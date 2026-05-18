import type { AgentPersonaId } from "./personas";
import type { StoryEventKind } from "../story-events";
import type { BeatId } from "./story-copy";

export interface StoryBeat {
  beatId: BeatId;
  sceneId: string;
  kind: StoryEventKind;
  speakerId?: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  mentions?: AgentPersonaId[];
  tags?: string[];
}

export const WAR_ROOM_BRIEF_BEATS: StoryBeat[] = [];
export const WAR_ROOM_BRIEF_OPS_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_BEFORE_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_AFTER_RESEARCH_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_BEFORE_QA_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_AFTER_QA_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_SYNTHESIS_BEATS: StoryBeat[] = [];
export const INTELLIGENCE_PHOTO_BEATS: StoryBeat[] = [];
export const WAR_ROOM_HANDOFF_BEATS: StoryBeat[] = [];
export const MARKETING_BEFORE_BEATS: StoryBeat[] = [];
export const MARKETING_AFTER_WRITER_BEATS: StoryBeat[] = [];
export const MARKETING_BEFORE_SOCIAL_BEATS: StoryBeat[] = [];
export const MARKETING_AFTER_SOCIAL_BEATS: StoryBeat[] = [];
export const MARKETING_WRAP_BEATS: StoryBeat[] = [];
export const MARKETING_SCHEDULE_BEATS: StoryBeat[] = [];
export const WAR_ROOM_FINAL_MARKETING_BEATS: StoryBeat[] = [];
export const WAR_ROOM_FINAL_INTEL_ONLY_BEATS: StoryBeat[] = [];
export const WAR_ROOM_FINAL_OPS_BEATS: StoryBeat[] = [];
export const WAR_ROOM_FINAL_CANCEL_BEATS: StoryBeat[] = [];
