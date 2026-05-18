import type { AgentPersonaId } from "./personas";

export type BeatId = string;

export interface StoryCopyContext {
  taskId: string;
  intentType: string;
  topic?: string;
  beatId: BeatId;
  speakerId?: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  dynamic?: unknown;
}

export function getStoryCopy(ctx: StoryCopyContext) {
  const topic = ctx.topic || "brief ini";
  if (ctx.beatId.includes("error")) return "Task gagal diproses.";
  if (ctx.speakerId === "intelgen") return `Intelgen memproses bahan untuk ${topic}.`;
  if (ctx.speakerId === "marketing") return `Marketing memproses konten untuk ${topic}.`;
  if (ctx.speakerId === "chief") return `Chief mengarahkan pekerjaan untuk ${topic}.`;
  return `Sistem mencatat progres untuk ${topic}.`;
}

export function getSpeakerFromBeatId(beatId: BeatId): AgentPersonaId {
  if (beatId.includes("intelgen") || beatId.includes("intel_head") || beatId.includes("research") || beatId.includes("qa")) {
    return "intelgen";
  }
  if (beatId.includes("marketing") || beatId.includes("writer") || beatId.includes("social")) {
    return "marketing";
  }
  if (beatId.includes("chief")) return "chief";
  return "system";
}
