import { tool } from "ai";
import { z } from "zod";

/**
 * AI SDK tool for creating an Agen Team task.
 *
 * Used by the Chief Chat (Pak Arga) endpoint to delegate work
 * to the Agen Team pipeline. The tool result contains a taskId
 * that the frontend uses to open Story Film Player.
 */
export const createAgenTeamTaskTool = tool({
  description:
    "Create an Agen Team task and delegate it to the team. Only call this when the user's brief is clear and actionable. Returns a taskId that opens the cinematic story mode. Note: full_auto_publish is currently disabled until real Composio account connection, approval flow, and action execution are implemented.",
  inputSchema: z.object({
    intentType: z.enum([
      "research_only",
      "research_and_draft_content",
      "full_auto_publish",
      "ask_operations_cost",
      "find_photo_only",
      "continue_from_memory",
      "schedule_content",
      "cancel_task",
    ]),
    topic: z.string().describe("Brief topic summary for the team"),
    brief: z.string().optional().describe("Extended brief details"),
    platform: z
      .string()
      .optional()
      .describe("Target platform (e.g. Instagram, Twitter)"),
    outputFormat: z
      .string()
      .optional()
      .describe("Desired output format (e.g. carousel, thread)"),
    requirements: z
      .array(z.string())
      .optional()
      .describe("Specific requirements or constraints"),
    maxSources: z
      .number()
      .optional()
      .describe("Maximum number of research sources"),
    needsPhoto: z
      .boolean()
      .optional()
      .describe("Whether the task needs photo/visual assets"),
  }),
});
