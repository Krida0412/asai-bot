import type {
  StoryEvent,
  StoryEventKind,
  StoryPovAgentId,
  StoryRoomId,
} from "../story-events";
import { getStoryStageName } from "../story-events";
import { pgDb as db } from "../../db/pg/db.pg";
import { TaskOutputTable } from "../../db/pg/schema.pg";

export interface ProgressEvent {
  type: "progress" | "done";
  division: string;
  msg: string;
  pct: number;
  ts: string;
  fromAgent?: string;
  toAgent?: string;
  result?: Record<string, unknown>;
  error?: string;
}

interface EmitStoryInput {
  kind: StoryEventKind;
  roomId: StoryRoomId;
  sceneId: string;
  povAgentId: StoryPovAgentId;
  speakerId?: string;
  targetIds?: string[];
  message?: string;
  timestamp?: string;
  mentions?: string[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;
}

async function insertEvent(
  taskId: string,
  stageName: string,
  content: ProgressEvent | StoryEvent,
) {
  await db.insert(TaskOutputTable).values({
    taskId,
    stageName,
    content,
    tokenUsageInput: 0,
    tokenUsageOutput: 0,
  });
}

export class ProgressEmitter {
  private taskId: string;
  private _done = false;

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  get isDone() {
    return this._done;
  }

  async emit(
    division: string,
    message: string,
    pct: number,
    fromAgent?: string,
    toAgent?: string,
  ): Promise<void> {
    const event: ProgressEvent = {
      type: "progress",
      division,
      msg: message,
      pct,
      ts: new Date().toISOString(),
      fromAgent,
      toAgent,
    };

    try {
      await insertEvent(
        this.taskId,
        `progress:${division.toLowerCase()}`,
        event,
      );
    } catch (error) {
      console.warn("Failed to emit legacy progress:", error);
    }
  }

  async emitStory(input: EmitStoryInput): Promise<StoryEvent | null> {
    const event: StoryEvent = {
      type: "story",
      taskId: this.taskId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...input,
    };

    try {
      await insertEvent(this.taskId, getStoryStageName(event.kind), event);
      return event;
    } catch (error) {
      console.warn("Failed to emit story event:", error);
      return null;
    }
  }

  async done(result?: Record<string, unknown>, error?: string): Promise<void> {
    const event: ProgressEvent = {
      type: "done",
      division: "System",
      msg: error || "Task completed",
      pct: 100,
      ts: new Date().toISOString(),
      fromAgent: "Sistem",
      toAgent: "Chief Agent",
      result,
      error,
    };

    try {
      await insertEvent(this.taskId, "progress:done", event);
    } catch (emitError) {
      console.warn("Failed to emit done:", emitError);
    }

    this._done = true;
  }
}

export function createEmitter(taskId: string): ProgressEmitter {
  return new ProgressEmitter(taskId);
}
