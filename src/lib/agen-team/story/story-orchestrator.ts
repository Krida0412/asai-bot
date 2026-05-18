import type {
  StoryEvent,
  StoryEventKind,
  StoryPovAgentId,
  StoryRoomId,
} from "../story-events";
import type { ProgressEmitter } from "../utils/progress-emitter";
import type { AgentPersonaId } from "./personas";
import { STORY_SCENES, type StorySceneId } from "./story-scenes";

export interface StoryContext {
  taskId: string;
  intentType: string;
  topic?: string;
  taskPayload?: unknown;
}

export interface EmitStoryParams {
  kind: StoryEventKind;
  sceneId: string;
  speakerId?: AgentPersonaId;
  targetIds?: AgentPersonaId[];
  message?: string;
  mentions?: AgentPersonaId[];
  tags?: string[];
  replyToId?: string | null;
  meta?: Record<string, unknown>;
}

const emittedBeatKeys = new Map<string, Set<string>>();

export function clearBeatKeys(taskId: string): void {
  emittedBeatKeys.delete(taskId);
}

function markBeatKey(taskId: string, beatKey: string) {
  const set = emittedBeatKeys.get(taskId) ?? new Set<string>();
  set.add(beatKey);
  emittedBeatKeys.set(taskId, set);
}

function hasBeatKey(taskId: string, beatKey: string) {
  return emittedBeatKeys.get(taskId)?.has(beatKey) ?? false;
}

function topicLabel(ctx: StoryContext) {
  return ctx.topic?.trim() || "brief ini";
}

function compact(value: unknown, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function sceneInfo(sceneId: string): {
  roomId: StoryRoomId;
  povAgentId: StoryPovAgentId;
} {
  const scene = STORY_SCENES[sceneId as StorySceneId];
  return {
    roomId: (scene?.roomId as StoryRoomId) ?? "war_room",
    povAgentId: (scene?.povAgentId as StoryPovAgentId) ?? "chief",
  };
}

export async function emitStoryBeat(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  params: EmitStoryParams,
): Promise<StoryEvent | null> {
  const beatKey =
    typeof params.meta?.beatKey === "string"
      ? params.meta.beatKey
      : `${params.sceneId}:${params.speakerId ?? "system"}:${params.kind}:${params.tags?.join(",") ?? ""}`;
  if (hasBeatKey(ctx.taskId, beatKey)) return null;

  const scene = sceneInfo(params.sceneId);
  const result = await emitter.emitStory({
    kind: params.kind,
    roomId: scene.roomId,
    sceneId: params.sceneId,
    povAgentId: scene.povAgentId,
    speakerId: params.speakerId,
    targetIds: params.targetIds,
    message: params.message,
    mentions: params.mentions,
    tags: params.tags,
    replyToId: params.replyToId,
    meta: { ...(params.meta ?? {}), beatKey },
  });
  if (result) markBeatKey(ctx.taskId, beatKey);
  return result;
}

async function emitSceneStart(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  sceneId: StorySceneId,
) {
  const scene = STORY_SCENES[sceneId];
  await emitStoryBeat(emitter, ctx, {
    kind: "scene_start",
    sceneId,
    speakerId: scene.povAgentId,
    message: `${scene.title} dimulai.`,
    tags: ["scene_open"],
    meta: { beatKey: `${sceneId}:scene_start` },
  });
}

async function emitSceneEnd(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  sceneId: StorySceneId,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "scene_end",
    sceneId,
    speakerId: STORY_SCENES[sceneId].povAgentId,
    tags: ["scene_close"],
    meta: { beatKey: `${sceneId}:scene_end` },
  });
}

async function emitTyping(
  emitter: ProgressEmitter,
  sceneId: StorySceneId,
  speakerId: AgentPersonaId,
) {
  const scene = STORY_SCENES[sceneId];
  await emitter.emitStory({
    kind: "typing",
    roomId: scene.roomId,
    sceneId,
    povAgentId: scene.povAgentId as StoryPovAgentId,
    speakerId,
    tags: ["typing"],
  });
}

export async function emitWarRoomBrief(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  extraMeta?: Record<string, unknown>,
) {
  await emitSceneStart(emitter, ctx, "war_room_brief");
  const message =
    ctx.intentType === "ask_operations_cost"
      ? "Mode operasi/finance sedang dinonaktifkan di runtime 3-agent. Saya tidak akan menjalankan agent keempat."
      : `@Bu Rani, @Pak Bima, brief sudah disetujui untuk ${topicLabel(ctx)}. Bu Rani pegang Intelgen, Pak Bima pegang Marketing dan publish Instagram.`;
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "war_room_brief",
    speakerId: "chief",
    targetIds: ctx.intentType === "ask_operations_cost" ? [] : ["intelgen", "marketing"],
    mentions: ctx.intentType === "ask_operations_cost" ? [] : ["intelgen", "marketing"],
    message,
    meta: { ...(extraMeta ?? {}), beatKey: "war_room_brief:chief:assignment" },
  });
  await emitSceneEnd(emitter, ctx, "war_room_brief");
}

export async function emitIntelligenceOpen(
  emitter: ProgressEmitter,
  ctx: StoryContext,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "narrator",
    sceneId: "intelligence_work",
    speakerId: "system",
    message: "Intelgen mulai mencari, memverifikasi, dan merapikan bahan.",
    tags: ["transition"],
    meta: { beatKey: "narrator:war_room_to_intelgen" },
  });
  await emitSceneStart(emitter, ctx, "intelligence_work");
}

export async function emitResearchTyping(
  emitter: ProgressEmitter,
  _ctx: StoryContext,
) {
  await emitTyping(emitter, "intelligence_work", "intelgen");
}

export async function emitResearchDone(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const research = dynamic?.research ?? dynamic?.intelgen ?? {};
  const finding = Array.isArray(research.keyFindings)
    ? research.keyFindings[0]
    : "";
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "intelgen",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      research.agentMessage ??
      `Pak Arga, bahan Intelgen untuk ${topicLabel(ctx)} sudah masuk. Pegangan utama: ${compact(finding || "sumber dan klaim sudah saya cek")}`,
    meta: {
      beatKey: "intelligence_work:intelgen:done",
      keyFindings: research.keyFindings ?? [],
      sourceCount: research.sourceCount ?? 0,
    },
  });
}

export async function emitQABefore() {}
export async function emitQATyping(
  emitter: ProgressEmitter,
  _ctx: StoryContext,
) {
  await emitTyping(emitter, "intelligence_work", "intelgen");
}
export async function emitQADone(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const qa = dynamic?.qa ?? {};
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "intelgen",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      qa.agentMessage ??
      `Pak Arga, validasi selesai. ${compact(qa.safetyNote || qa.riskNotes?.[0] || "Klaim aman untuk dipakai dengan wording hati-hati.")}`,
    meta: { beatKey: "intelligence_work:intelgen:validation", risks: qa.riskNotes ?? [] },
  });
}

export async function emitIntelligenceClose(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const intel = dynamic?.intel ?? dynamic?.intelgen ?? {};
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "intelgen",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      intel.agentMessage ??
      `Pak Arga, Intelgen saya tutup. Bahan siap untuk keputusan Chief berikutnya.`,
    meta: {
      beatKey: "intelligence_work:intelgen:close",
      strongestInsights: intel.strongestInsights ?? [],
    },
  });
  await emitSceneEnd(emitter, ctx, "intelligence_work");
}

export async function emitIntelRevisionRequest(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  params: { reason: string; requiredChanges?: string[]; attempt: number },
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "chief",
    targetIds: ["intelgen"],
    mentions: ["intelgen"],
    message: `Bu Rani, revisi Intelgen diperlukan: ${compact(params.reason)}`,
    meta: {
      beatKey: `intelligence_work:chief:intelgen_revision:${params.attempt}`,
      decision: "revise_intelgen",
      requiredChanges: params.requiredChanges ?? [],
    },
  });
}

export async function emitWarRoomHandoff(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "narrator",
    sceneId: "war_room_intelligence_handoff",
    speakerId: "system",
    message: "Intelgen membawa bahan kembali ke War Room untuk diarahkan ke Marketing.",
    tags: ["transition"],
    meta: { beatKey: "narrator:intelgen_to_war_room" },
  });
  await emitSceneStart(emitter, ctx, "war_room_intelligence_handoff");
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "war_room_intelligence_handoff",
    speakerId: "intelgen",
    targetIds: ["chief", "marketing"],
    mentions: ["chief", "marketing"],
    message:
      dynamic?.intel?.warRoomReportMessage ??
      `Pak Arga, Pak Bima, bahan untuk ${topicLabel(ctx)} siap dipakai Marketing.`,
    meta: { beatKey: "war_room_handoff:intelgen:report" },
  });
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "war_room_intelligence_handoff",
    speakerId: "chief",
    targetIds: ["marketing"],
    mentions: ["marketing"],
    message: "Pak Bima, ambil bahan Intelgen dan lanjutkan sebagai Marketing Agent.",
    meta: { beatKey: "war_room_handoff:chief:assign_marketing" },
  });
  await emitSceneEnd(emitter, ctx, "war_room_intelligence_handoff");
}

export async function emitMarketingOpen(
  emitter: ProgressEmitter,
  ctx: StoryContext,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "narrator",
    sceneId: "marketing_work",
    speakerId: "system",
    message: "Marketing mulai menyusun konten dan kesiapan publish.",
    tags: ["transition"],
    meta: { beatKey: "narrator:war_room_to_marketing" },
  });
  await emitSceneStart(emitter, ctx, "marketing_work");
}

export async function emitWriterTyping(
  emitter: ProgressEmitter,
  _ctx: StoryContext,
) {
  await emitTyping(emitter, "marketing_work", "marketing");
}
export async function emitWriterDone(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const writer = dynamic?.writer ?? dynamic?.marketing ?? {};
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      writer.agentMessage ??
      `Pak Arga, draft Marketing sudah terbentuk. Preview: ${compact(writer.captionPreview || writer.hook || "caption siap dicek")}`,
    meta: { beatKey: "marketing_work:marketing:draft", captionPreview: writer.captionPreview },
  });
}

export async function emitMarketingPrePublishDecision(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  params: {
    message: string;
    decision: string;
    requiredChanges?: string[];
    revisionCount?: number;
    marketingReview?: Record<string, unknown>;
  },
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message: params.message,
    meta: {
      beatKey: `marketing_work:marketing:decision:${params.revisionCount ?? 0}:${params.decision}`,
      decision: params.decision,
      requiredChanges: params.requiredChanges ?? [],
      marketingReview: params.marketingReview ?? null,
    },
  });
}

export async function emitSocialBefore() {}
export async function emitSocialTyping(
  emitter: ProgressEmitter,
  _ctx: StoryContext,
) {
  await emitTyping(emitter, "marketing_work", "marketing");
}
export async function emitSocialUploadStart(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const social = dynamic?.social ?? {};
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      social.agentMessage ??
      `Pak Arga, visual siap. Marketing mulai upload Instagram.`,
    meta: {
      beatKey: "marketing_work:marketing:upload_start",
      imageUrl: social.imageUrl,
      visualSource: social.visualSource,
    },
  });
}
export async function emitSocialDone(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  const social = dynamic?.social ?? {};
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      social.agentMessage ??
      `Pak Arga, status publish sudah saya terima: ${compact(social.publicationResult || "draft_only")}`,
    meta: {
      beatKey: "marketing_work:marketing:publish_done",
      publicationResult: social.publicationResult,
    },
  });
}

export async function emitMarketingClose(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  dynamic?: Record<string, any>,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message:
      dynamic?.marketing?.agentMessage ??
      "Pak Arga, Marketing saya tutup. Copy, visual, dan status publish sudah siap direview.",
    meta: { beatKey: "marketing_work:marketing:close" },
  });
  await emitSceneEnd(emitter, ctx, "marketing_work");
}

export async function emitWarRoomFinal(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  opts: {
    hasMarketing: boolean;
    finalOutput: unknown;
    sourceStage: string;
    dynamic?: Record<string, any>;
  },
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "narrator",
    sceneId: "war_room_final",
    speakerId: "system",
    message: "Chief menutup pekerjaan dan menampilkan hasil akhir.",
    tags: ["transition"],
    meta: { beatKey: "narrator:to_final" },
  });
  await emitSceneStart(emitter, ctx, "war_room_final");
  if (opts.hasMarketing) {
    await emitStoryBeat(emitter, ctx, {
      kind: "agent_message",
      sceneId: "war_room_final",
      speakerId: "marketing",
      targetIds: ["chief"],
      mentions: ["chief"],
      message:
        opts.dynamic?.final?.marketingHeadMessage ??
        "Pak Arga, hasil Marketing sudah saya serahkan untuk keputusan akhir.",
      meta: { beatKey: "war_room_final:marketing:report", sourceStage: opts.sourceStage },
    });
  }
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "war_room_final",
    speakerId: "chief",
    targetIds: opts.hasMarketing ? ["marketing", "intelgen"] : ["intelgen"],
    mentions: opts.hasMarketing ? ["marketing", "intelgen"] : ["intelgen"],
    message:
      opts.dynamic?.final?.chiefMessage ??
      "Saya sudah menerima hasil akhir. Statusnya saya sampaikan apa adanya.",
    meta: { beatKey: "war_room_final:chief:verdict", sourceStage: opts.sourceStage },
  });
  await emitStoryBeat(emitter, ctx, {
    kind: "result_card",
    sceneId: "war_room_final",
    speakerId: "chief",
    message: opts.dynamic?.final?.resultTitle ?? "Hasil akhir siap ditinjau.",
    meta: {
      beatKey: "war_room_final:result_card",
      finalOutput: opts.finalOutput,
      sourceStage: opts.sourceStage,
    },
  });
  await emitSceneEnd(emitter, ctx, "war_room_final");
}

export async function emitReceipt(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  meta?: Record<string, unknown>,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "receipt",
    sceneId: "war_room_final",
    speakerId: "system",
    message: "Receipt operasional dicatat oleh sistem.",
    meta: { beatKey: "system:receipt", ...(meta ?? {}) },
  });
}

export async function emitStoryError(emitter: ProgressEmitter, ctx: StoryContext) {
  await emitStoryBeat(emitter, ctx, {
    kind: "system",
    sceneId: "war_room_final",
    speakerId: "system",
    message: "Task gagal diproses. Detail error teknis disimpan di output sistem.",
    tags: ["error"],
    meta: { beatKey: "error:system" },
  });
}

export async function emitChiefCheckpoint(
  emitter: ProgressEmitter,
  ctx: StoryContext,
  params: {
    checkpoint: string;
    proceed: boolean;
    concern: string | null;
    guidance: string | null;
    utterance: string;
  },
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "war_room_final",
    speakerId: "chief",
    message: params.utterance,
    tags: ["checkpoint", params.checkpoint],
    meta: {
      beatKey: `checkpoint:chief:${params.checkpoint}`,
      checkpoint: params.checkpoint,
      proceed: params.proceed,
      concern: params.concern,
      guidance: params.guidance,
    },
  });
}

export async function emitResearchStart(
  emitter: ProgressEmitter,
  ctx: StoryContext,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "intelgen",
    targetIds: ["chief"],
    mentions: ["chief"],
    message: `Pak Arga, Intelgen mulai mengumpulkan sumber untuk ${topicLabel(ctx)}.`,
    meta: { beatKey: "intelligence_work:intelgen:start" },
  });
}

export async function emitQAStart(
  emitter: ProgressEmitter,
  ctx: StoryContext,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "intelligence_work",
    speakerId: "intelgen",
    targetIds: ["chief"],
    mentions: ["chief"],
    message: "Pak Arga, saya lanjutkan validasi klaim dan risiko sumber.",
    meta: { beatKey: "intelligence_work:intelgen:qa_start" },
  });
}

export async function emitWriterStart(
  emitter: ProgressEmitter,
  ctx: StoryContext,
) {
  await emitStoryBeat(emitter, ctx, {
    kind: "agent_message",
    sceneId: "marketing_work",
    speakerId: "marketing",
    targetIds: ["chief"],
    mentions: ["chief"],
    message: `Pak Arga, Marketing mulai menyusun caption untuk ${topicLabel(ctx)}.`,
    meta: { beatKey: "marketing_work:marketing:start" },
  });
}
