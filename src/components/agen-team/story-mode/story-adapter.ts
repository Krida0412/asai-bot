import { safeJSONParse } from "@/lib/utils";
import {
  AGENT_PERSONAS,
  getPersonaByBackendRole,
  getPovAgentForRoom,
  getSceneForRoom,
} from "./personas";
import type {
  AgentPersonaId,
  CinematicScene,
  RoomId,
  SSEEventLike,
  StageOutputLike,
  StoryEventLike,
  StoryItem,
} from "./types";

function parseContent(content: unknown) {
  if (typeof content === "string") {
    const parsed = safeJSONParse<Record<string, unknown>>(content);
    return parsed.success ? parsed.value : content;
  }

  return content;
}

function stableKey(value: unknown) {
  try {
    return JSON.stringify(value)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 80);
  } catch {
    return String(value ?? "item")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 80);
  }
}

function normalizeRoom(roomId?: string, division?: string): RoomId {
  if (roomId === "intelligence" || division === "Intelligence") {
    return "intelligence";
  }
  if (roomId === "marketing" || division === "Marketing") {
    return "marketing";
  }
  return "war_room";
}

function normalizePersona(value?: string): AgentPersonaId {
  if (value === "chief" || value === "intelgen" || value === "marketing" || value === "system") {
    return value;
  }
  if (value === "intel_head" || value === "research" || value === "qa") return "intelgen";
  if (value === "marketing_head" || value === "writer" || value === "social") return "marketing";
  if (value === "operations_system") return "system";

  return getPersonaByBackendRole(value);
}

function getSpeakerFromLegacyEvent(event: SSEEventLike): AgentPersonaId {
  if (event.fromAgent) {
    return getPersonaByBackendRole(event.fromAgent);
  }

  if (event.division === "Chief") return "chief";
  if (event.division === "Operations") return "system";
  if (event.division === "Intelligence") return "intelgen";
  if (event.division === "Marketing") return "marketing";

  return "system";
}

function cleanRawMessage(message: string) {
  return message
    .replace(/\bvia exa\b/gi, "")
    .replace(/\bexa\b/gi, "")
    .replace(/\blaporan eksekutif\b/gi, "")
    .replace(/\briset data selesai\b/gi, "")
    .replace(/\bmengirim ke auditor\b/gi, "")
    .replace(/\baudit selesai\b/gi, "")
    .replace(/\bdata dikembalikan ke chief\b/gi, "")
    .replace(/\bprogress\b/gi, "")
    .replace(/\bpipeline\b/gi, "")
    .replace(/\btool\b/gi, "")
    .replace(/\.\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNaturalDialogue(raw: string) {
  if (!raw) return false;

  const technicalPatterns = [
    /\bvia\b/i,
    /\bexa\b/i,
    /\bauditor\b/i,
    /\bchief\b/i,
    /\bprogress\b/i,
    /\bpipeline\b/i,
    /\blaporan eksekutif\b/i,
    /\briset data selesai\b/i,
    /\bmengirim ke auditor\b/i,
    /\baudit selesai\b/i,
    /\bdata dikembalikan ke chief\b/i,
    /\bmemulai pencarian\b/i,
    /\bmenyusun laporan\b/i,
  ];

  return !technicalPatterns.some((pattern) => pattern.test(raw));
}

function detectMentions(message: string): AgentPersonaId[] {
  const mentions: AgentPersonaId[] = [];
  const mentionMap = {
    "@Pak Arga": "chief",
    "@Bu Rani": "intelgen",
    "@Dimas": "intelgen",
    "@Maya": "intelgen",
    "@Pak Bima": "marketing",
    "@Naya": "marketing",
    "@Rafi": "marketing",
  } as const;

  for (const [token, personaId] of Object.entries(mentionMap)) {
    if (message.includes(token)) {
      mentions.push(personaId);
    }
  }

  return mentions;
}

/**
 * Varied fallback messages per speaker.
 * Used when legacy events have technical/unnatural copy.
 * Two variants per speaker to avoid robotic repetition.
 */
const SPEAKER_FALLBACKS: Record<AgentPersonaId, [string, string]> = {
  chief: [
    "Kita kerjakan ini. @Bu Rani mulai dari intelijen dulu, @Pak Bima tunggu bahan yang sudah matang.",
    "@Bu Rani, @Pak Bima, kita ambil request ini. @Bu Rani mulai dari riset dulu, @Pak Bima standby.",
  ],
  intelgen: [
    "Saya rapikan dulu hasil Dimas dan Maya. Yang sudah kuat saya bawa balik ke Pak Arga.",
    "Oke, saya rangkum jadi insight yang aman dipakai. Yang belum solid saya beri catatan.",
  ],
  marketing: [
    "@Naya, @Rafi, insight dari @Bu Rani sudah masuk. @Naya bikin draft awal, @Rafi cek platform fit, CTA, dan formatnya.",
    "Kita olah insight ini jadi konten yang lebih mudah dibaca. @Naya pegang draft, @Rafi pastikan formatnya siap untuk platform tujuan.",
  ],
  system: [
    "Sistem mencatat pembaruan terbaru untuk alur kerja ini.",
    "Sistem mencatat pembaruan terbaru untuk alur kerja ini.",
  ],
};

/** Simple stable hash for picking fallback variant. */
function fallbackHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function humanizeStoryMessage(
  event: SSEEventLike,
  speakerId: AgentPersonaId,
): string {
  const raw = cleanRawMessage(event.message ?? event.msg ?? event.error ?? "");

  if (event.error) {
    return "Ada kendala di alur kerja. Saya tandai dulu supaya bisa dicek ulang.";
  }

  if (event.type === "done") {
    return "Semua alur utama sudah rapi. Hasil akhirnya siap ditinjau.";
  }

  if (isNaturalDialogue(raw)) {
    return raw;
  }

  // Pick a stable fallback variant based on raw content
  const variants = SPEAKER_FALLBACKS[speakerId] ?? SPEAKER_FALLBACKS.system;
  const idx = fallbackHash(raw || speakerId) % 2;
  return variants[idx];
}

function getNarrationForTransition(fromRoom: RoomId, toRoom: RoomId) {
  if (fromRoom === "war_room" && toRoom === "intelligence") {
    return "Setelah brief diterima, Bu Rani membuka ruang Intelijen untuk membagi pekerjaan riset.";
  }
  if (fromRoom === "intelligence" && toRoom === "war_room") {
    return "Setelah riset awal dirapikan, Bu Rani membawa hasil Intelijen kembali ke War Room.";
  }
  if (fromRoom === "war_room" && toRoom === "marketing") {
    return "Setelah insight cukup matang, Pak Bima membuka ruang Marketing untuk menyusun narasi.";
  }
  if (fromRoom === "marketing" && toRoom === "war_room") {
    return "Draft sudah terbentuk. Pak Bima membawa hasil Marketing kembali ke War Room untuk ditinjau Pak Arga.";
  }

  return "";
}

function createScene(
  roomId: RoomId,
  sceneId: string,
  index: number,
  transitionBefore?: string,
): CinematicScene {
  const baseScene = getSceneForRoom(roomId);
  return {
    ...baseScene,
    id: `${sceneId}-${index}`,
    sceneId,
    roomId,
    transitionBefore,
    items: [],
  };
}

function getEventTimestamp(event: StoryEventLike | SSEEventLike) {
  return event.timestamp ?? event.ts ?? new Date().toISOString();
}

function isStoryEventLike(value: unknown): value is StoryEventLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.type === "story" && typeof record.kind === "string";
}

function extractStoryEvents(outputs: StageOutputLike[]) {
  return outputs
    .filter((output) => output.stageName.startsWith("story:"))
    .map((output) => parseContent(output.content))
    .filter(isStoryEventLike);
}

function extractLegacyEvents(outputs: StageOutputLike[]) {
  return outputs
    .filter((output) => output.stageName.startsWith("progress:"))
    .map((output) => parseContent(output.content) as SSEEventLike)
    .filter((event) => typeof event === "object" && event !== null);
}

function buildReceiptItem(
  event: StoryEventLike | SSEEventLike,
  index: number,
): StoryItem {
  const meta =
    typeof event.meta === "object" && event.meta !== null ? event.meta : {};
  const result =
    typeof event.result === "object" && event.result !== null
      ? (event.result as Record<string, unknown>)
      : {};

  return {
    id: `receipt-${index}-${stableKey(event)}`,
    kind: "receipt",
    roomId: "war_room",
    sceneId: "war_room_final",
    speakerId: "system",
    targetId: "chief",
    timestamp: getEventTimestamp(event),
    message:
      event.message ??
      event.msg ??
      "Data operasional task ini sudah dicatat oleh sistem.",
    meta: {
      source: "story",
      rawEvent: event,
      ...meta,
      tokenUsageInput:
        meta.tokenUsageInput ?? result.tokenUsageInput ?? result.inputTokens,
      tokenUsageOutput:
        meta.tokenUsageOutput ?? result.tokenUsageOutput ?? result.outputTokens,
      totalCostUsd:
        meta.totalCostUsd ?? result.totalCostUsd ?? result.estimatedCostUsd,
      estimatedCostUsd:
        meta.estimatedCostUsd ?? result.estimatedCostUsd ?? result.totalCostUsd,
    },
  };
}

export function getDisplayableResultOutput(outputs: StageOutputLike[]) {
  return (
    outputs.find((output) => output.stageName === "instagram_publish_result") ??
    outputs.find((output) => output.stageName === "marketing") ??
    outputs.find((output) => output.stageName === "marketing_draft") ??
    outputs.find((output) => output.stageName === "intelligence") ??
    outputs.find((output) => output.stageName === "system_error") ??
    null
  );
}

function buildNativeAgentItem(
  event: StoryEventLike,
  index: number,
): StoryItem | null {
  const roomId = normalizeRoom(event.roomId);
  const speakerId = normalizePersona(event.speakerId);

  if (
    event.kind === "typing" ||
    event.kind === "scene_start" ||
    event.kind === "scene_end"
  ) {
    return null;
  }

  if (event.kind === "receipt") {
    return buildReceiptItem(event, index);
  }

  if (event.kind === "result_card") {
    return {
      id: `native-result-${event.sceneId}-${index}-${stableKey(event)}`,
      kind: "result_card",
      roomId: "war_room",
      sceneId: event.sceneId || "war_room_final",
      speakerId: speakerId === "system" ? "chief" : speakerId,
      timestamp: getEventTimestamp(event),
      message: event.message,
      meta: {
        ...(event.meta ?? {}),
        source: "story",
        rawEvent: event,
      },
    };
  }

  if (event.kind === "narrator" || event.kind === "system") {
    return {
      id: `native-${event.kind}-${event.sceneId}-${index}-${stableKey(event)}`,
      kind: event.kind === "narrator" ? "narrator" : "system",
      roomId,
      sceneId: event.sceneId,
      speakerId: "system",
      timestamp: getEventTimestamp(event),
      message: event.message ?? "",
      meta: {
        ...(event.meta ?? {}),
        source: "story",
        rawEvent: event,
      },
    };
  }

  // P4-P8: Detect decision-bearing events and emit decision/checkpoint cards
  const meta = event.meta ?? {};
  const itemKind = detectNativeItemKind(meta, event.tags);

  return {
    id: `native-message-${event.sceneId}-${index}-${stableKey(event)}`,
    kind: itemKind,
    roomId,
    sceneId: event.sceneId,
    speakerId,
    targetId: event.targetIds?.[0],
    message: event.message ?? humanizeStoryMessage(event, speakerId),
    timestamp: getEventTimestamp(event),
    mentions: event.mentions ?? detectMentions(event.message ?? ""),
    tags: event.tags,
    replyToId: event.replyToId,
    meta: {
      ...meta,
      source: "story",
      rawEvent: event,
      speakerName: AGENT_PERSONAS[speakerId].displayName,
    },
  };
}

/**
 * Determine if a native agent message should be rendered as a
 * DecisionCard or CheckpointCard instead of a regular StoryBubble.
 */
function detectNativeItemKind(
  meta: Record<string, unknown>,
  tags?: string[],
): "agent_message" | "decision_card" | "checkpoint_card" {
  // Chief checkpoint events
  if (meta.checkpoint || tags?.includes("checkpoint")) {
    return "checkpoint_card";
  }

  // Marketing pre-publish with structured review
  if (meta.marketingReview && meta.decision) {
    return "decision_card";
  }

  // Intelligence brief decisions
  if (meta.intelligenceBrief && meta.decision) {
    return "decision_card";
  }

  // Any event with a structured decision and high enough detail
  if (
    meta.decision &&
    (meta.requiredChanges || meta.confidence || meta.reason)
  ) {
    return "decision_card";
  }

  return "agent_message";
}

function buildLegacyAgentItem(event: SSEEventLike, index: number): StoryItem {
  if (event.division === "Operations") {
    return buildReceiptItem(event, index);
  }

  const roomId = normalizeRoom(undefined, event.division);
  const speakerId = getSpeakerFromLegacyEvent(event);
  const message = humanizeStoryMessage(event, speakerId);

  return {
    id: `legacy-message-${index}-${stableKey(event)}`,
    kind: "agent_message",
    roomId,
    sceneId: roomId,
    speakerId,
    targetId: event.toAgent
      ? getPersonaByBackendRole(event.toAgent)
      : undefined,
    message,
    timestamp: getEventTimestamp(event),
    division: event.division,
    percentage: event.pct,
    mentions: detectMentions(message),
    meta: {
      source: "legacy",
      rawEvent: event,
      speakerName: AGENT_PERSONAS[speakerId].displayName,
    },
  };
}

/**
 * Anti-repetition check for adjacent story items.
 *
 * Catches:
 * 1. Same speaker, same/similar text
 * 2. Adjacent "Siap Pak/Bu" acknowledgments from different speakers
 */
function areMessagesTooSimilar(
  previous: StoryItem | undefined,
  next: StoryItem,
) {
  if (
    !previous ||
    previous.kind !== "agent_message" ||
    next.kind !== "agent_message"
  ) {
    return false;
  }

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();

  const previousMessage = normalize(previous.message ?? "");
  const nextMessage = normalize(next.message ?? "");

  // Same speaker, same text → always dedupe
  if (previous.speakerId === next.speakerId) {
    return (
      previousMessage === nextMessage ||
      previousMessage.includes(nextMessage) ||
      nextMessage.includes(previousMessage)
    );
  }

  // Different speakers but both are short acknowledgments
  // like "Siap Pak" / "Siap Pak" → keep both (they're from different people)
  // but catch truly identical text from different speakers
  if (previousMessage === nextMessage && previousMessage.length < 30) {
    return true;
  }

  return false;
}

function appendItemToScenes(
  scenes: CinematicScene[],
  item: StoryItem,
  transitionBefore?: string,
) {
  const latest = scenes[scenes.length - 1];
  const isSameScene =
    latest &&
    latest.roomId === item.roomId &&
    latest.sceneId === item.sceneId &&
    item.kind !== "result_card" &&
    item.kind !== "receipt";

  let scene = latest;
  if (!isSameScene) {
    scene = createScene(
      item.roomId,
      item.sceneId,
      scenes.length,
      transitionBefore,
    );
    scenes.push(scene);
  } else if (transitionBefore && !scene.transitionBefore) {
    scene.transitionBefore = transitionBefore;
  }

  if (!areMessagesTooSimilar(scene.items[scene.items.length - 1], item)) {
    scene.items.push(item);
  }
}

function buildScenesFromNativeEvents(
  events: StoryEventLike[],
  outputs: StageOutputLike[],
  taskStatus?: string,
): CinematicScene[] {
  const scenes: CinematicScene[] = [];
  let previousRoom: RoomId | null = null;
  let pendingTransition: string | undefined;

  // Deduplicate events by beatKey if present
  const seenBeatKeys = new Set<string>();
  const deduped = events.filter((event) => {
    const beatKey =
      typeof event.meta === "object" && event.meta !== null
        ? (event.meta as Record<string, unknown>).beatKey
        : undefined;
    if (typeof beatKey === "string") {
      if (seenBeatKeys.has(beatKey)) {
        return false;
      }
      seenBeatKeys.add(beatKey);
    }
    return true;
  });

  deduped.forEach((event, index) => {
    const roomId = normalizeRoom(event.roomId);
    const eventTransition =
      event.kind === "narrator"
        ? event.message
        : previousRoom && previousRoom !== roomId
          ? getNarrationForTransition(previousRoom, roomId)
          : undefined;

    if (event.kind === "narrator") {
      pendingTransition = event.message || pendingTransition;
      previousRoom = roomId;
      return;
    }

    const item = buildNativeAgentItem(event, index);
    if (!item) {
      if (event.kind === "scene_start") {
        const transition = pendingTransition ?? eventTransition;
        const sceneExists = scenes.some(
          (scene) => scene.sceneId === event.sceneId,
        );
        if (!sceneExists) {
          scenes.push(
            createScene(roomId, event.sceneId, scenes.length, transition),
          );
        }
        pendingTransition = undefined;
      }

      previousRoom = roomId;
      return;
    }

    const transition = pendingTransition ?? eventTransition;
    appendItemToScenes(scenes, item, transition);
    pendingTransition = undefined;
    previousRoom = roomId;
  });

  const hasNativeResultCard = deduped.some(
    (event) => event.kind === "result_card",
  );
  const finalItem = buildFinalResultItem(outputs, taskStatus);
  if (finalItem && !hasNativeResultCard) {
    appendItemToScenes(
      scenes,
      finalItem,
      scenes.length === 0
        ? undefined
        : getNarrationForTransition(
            scenes[scenes.length - 1].roomId,
            "war_room",
          ),
    );
  }

  return ensureAtLeastOneScene(scenes);
}

function buildScenesFromLegacyEvents(
  events: SSEEventLike[],
  outputs: StageOutputLike[],
  taskStatus?: string,
): CinematicScene[] {
  const scenes: CinematicScene[] = [];
  let previousRoom: RoomId | null = null;

  if (events.length === 0) {
    scenes.push({
      ...createScene("war_room", "war_room_intro", 0),
      items: [
        {
          id: "story-pending-war-room",
          kind: "scene_intro",
          sceneId: "war_room_intro",
          roomId: "war_room",
          speakerId: "system",
          message: "Pak Arga sedang menyiapkan brief untuk tim.",
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  events.forEach((event, index) => {
    if (event.type === "done") return;

    const item = buildLegacyAgentItem(event, index);
    const transition =
      previousRoom && previousRoom !== item.roomId
        ? getNarrationForTransition(previousRoom, item.roomId)
        : undefined;

    appendItemToScenes(scenes, item, transition);
    previousRoom = item.roomId;
  });

  const finalItem = buildFinalResultItem(outputs, taskStatus);
  if (finalItem) {
    appendItemToScenes(
      scenes,
      finalItem,
      scenes.length === 0
        ? undefined
        : getNarrationForTransition(
            scenes[scenes.length - 1].roomId,
            "war_room",
          ),
    );
  }

  return ensureAtLeastOneScene(scenes);
}

function ensureAtLeastOneScene(scenes: CinematicScene[]): CinematicScene[] {
  return scenes;
}

export function buildFinalResultItem(
  outputs: StageOutputLike[],
  taskStatus?: string,
): StoryItem | null {
  const finalOutput = getDisplayableResultOutput(outputs);

  if (!finalOutput) {
    return null;
  }

  if (
    taskStatus === "running" &&
    finalOutput.stageName !== "instagram_publish_result" &&
    finalOutput.stageName !== "system_error"
  ) {
    return null;
  }

  return {
    id: `result-${finalOutput?.id ?? finalOutput?.createdAt ?? taskStatus ?? "fallback"}`,
    kind: "result_card",
    roomId: "war_room",
    sceneId: "war_room_final",
    speakerId: finalOutput?.stageName === "system_error" ? "system" : "chief",
    timestamp: finalOutput?.createdAt ?? new Date().toISOString(),
    meta: {
      output: finalOutput ?? null,
      outputs,
      taskStatus,
    },
  };
}

function isVisibleStoryItem(item: StoryItem): boolean {
  return (
    item.kind === "agent_message" ||
    item.kind === "narrator" ||
    item.kind === "result_card" ||
    item.kind === "system"
  );
}

export function hasUsableStorySceneContent(
  outputs: StageOutputLike[],
  taskStatus?: string,
) {
  return mapOutputsToCinematicScenes(outputs, taskStatus).some((scene) =>
    scene.items.some(isVisibleStoryItem),
  );
}

export function mapOutputsToCinematicScenes(
  outputs: StageOutputLike[],
  taskStatus?: string,
): CinematicScene[] {
  let scenes: CinematicScene[] = [];
  const nativeEvents = extractStoryEvents(outputs);
  if (nativeEvents.length > 0) {
    scenes = buildScenesFromNativeEvents(nativeEvents, outputs, taskStatus);
  } else {
    scenes = buildScenesFromLegacyEvents(
      extractLegacyEvents(outputs),
      outputs,
      taskStatus,
    );
  }

  // Filter empty scenes
  const visibleScenes = scenes.filter((scene) =>
    scene.items.some(isVisibleStoryItem),
  );

  return visibleScenes;
}

export function mapOutputsToStoryItems(
  outputs: StageOutputLike[],
  taskStatus?: string,
): StoryItem[] {
  return mapOutputsToCinematicScenes(outputs, taskStatus).flatMap(
    (scene, index) => {
      const transitionItem: StoryItem[] = scene.transitionBefore
        ? [
            {
              id: `transition-${scene.id}-${index}`,
              kind: "narrator",
              sceneId: scene.sceneId,
              roomId: scene.roomId,
              speakerId: "system",
              message: scene.transitionBefore,
              timestamp: scene.items[0]?.timestamp ?? new Date().toISOString(),
            },
          ]
        : [];

      return [...transitionItem, ...scene.items];
    },
  );
}

export function mapSSEEventToStoryItems(event: SSEEventLike): StoryItem[] {
  const output: StageOutputLike = {
    stageName:
      event.type === "story" && event.kind
        ? `story:${event.kind}`
        : `progress:${(event.division ?? "system").toLowerCase()}`,
    content: event,
    createdAt: event.timestamp ?? event.ts,
  };

  return mapOutputsToStoryItems([output]);
}

export function getVisibleRoomPov(roomId: RoomId): AgentPersonaId {
  return getPovAgentForRoom(roomId);
}
