/**
 * Task-type to story-route mapping.
 * Defines the deterministic scene sequence for each intent type.
 */
import type { StorySceneId } from "./story-scenes";

export type IntentType =
  | "research_only"
  | "research_and_draft_content"
  | "full_auto_publish"
  | "ask_operations_cost"
  | "find_photo_only"
  | "continue_from_memory"
  | "schedule_content"
  | "cancel_task";

export const TASK_STORY_ROUTES: Record<IntentType, StorySceneId[]> = {
  research_only: [
    "war_room_brief",
    "intelligence_work",
    "war_room_final",
    "operations_receipt",
  ],
  research_and_draft_content: [
    "war_room_brief",
    "intelligence_work",
    "war_room_intelligence_handoff",
    "marketing_work",
    "war_room_final",
    "operations_receipt",
  ],
  full_auto_publish: [
    "war_room_brief",
    "intelligence_work",
    "war_room_intelligence_handoff",
    "marketing_work",
    "war_room_final",
    "operations_receipt",
  ],
  find_photo_only: [
    "war_room_brief",
    "intelligence_work",
    "war_room_final",
    "operations_receipt",
  ],
  ask_operations_cost: [
    "war_room_brief",
    "operations_receipt",
    "war_room_final",
  ],
  continue_from_memory: ["war_room_brief", "war_room_final"],
  schedule_content: [
    "war_room_brief",
    "marketing_work",
    "war_room_final",
    "operations_receipt",
  ],
  cancel_task: ["war_room_brief", "war_room_final"],
};

export function getStoryRoute(intent: string): StorySceneId[] {
  return (
    TASK_STORY_ROUTES[intent as IntentType] ?? [
      "war_room_brief",
      "war_room_final",
    ]
  );
}
