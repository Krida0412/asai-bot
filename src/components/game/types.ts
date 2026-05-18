export type SeatFacing = "right" | "up" | "left" | "down";
export type SeatStatus = "empty" | "returning" | "running" | "done" | "failed";
export type SeatType = "worker" | "agent";

export interface SeatState {
  seatId: string;
  label: string;
  seatType: SeatType;
  assigned?: boolean;
  spriteKey?: string;
  spritePath?: string;
  spawnX?: number;
  spawnY?: number;
  spawnFacing?: SeatFacing;
  status: SeatStatus;
  taskSnippet?: string;
  runId?: string;
  startedAt?: string;
}

export type TaskStatus =
  | "submitted"
  | "queued"
  | "returning"
  | "running"
  | "stopped"
  | "completed"
  | "failed"
  | "interrupted";

export interface TaskItem {
  taskId: string;
  message: string;
  status: TaskStatus;
  runId?: string;
  seatId?: string;
  sessionKey: string;
  actorName?: string;
  result?: string;
  createdAt: string;
  completedAt?: string;
}
