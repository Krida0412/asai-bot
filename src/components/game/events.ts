import type { SeatState } from "./types";
import type { SeatDef } from "./utils/MapHelpers";

export interface GameEventMap {
  "seats-discovered": [seats: SeatDef[]];
  "scene-ready": [];
  "seat-configs-updated": [seats: SeatState[]];
  "task-assigned": [taskId: string, message: string, seatId?: string, sessionKey?: string];
  "task-routed": [taskId: string, seatId: string, actorName: string];
  "task-ready": [taskId: string, message: string, seatId?: string];
  "task-bound": [taskId: string, runId: string];
  "task-staged": [taskId: string, stage: "queued" | "returning", seatId?: string];
  "task-bubble": [runId: string, text: string, ttl?: number];
  "task-aborted": [runId: string];
  "task-completed": [runId: string];
  "task-failed": [runId: string];
  "subagent-assigned": [runId: string, parentRunId: string, label: string, seatId?: string];
  "open-terminal": [seatId?: string];
  "open-terminal-queue": [seatId: string];
  "stop-task": [runId: string, seatId: string];
  "new-session-for-seat": [seatId: string];
  "open-session-history": [seatId: string];
  "terminal-closed": [];
  "boss-interacted": [agentId: string];
  "worker-interacted": [agentId: string];
}

type Listener<T extends unknown[]> = (...args: T) => void;

class GameEventBus {
  private listeners = new Map<string, Set<Listener<unknown[]>>>();

  on<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<unknown[]>);
    return () => this.off(event, fn);
  }

  off<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown[]>);
  }

  emit<K extends keyof GameEventMap>(event: K, ...args: GameEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`listener error on "${event}":`, err);
      }
    });
  }
}

export const gameEvents = new GameEventBus();
