import type { StoryEvent } from "@/lib/agen-team/story-events";
import type { StageOutputLike } from "./types";

const baseTime = new Date("2026-05-13T09:00:00.000Z").getTime();

function at(minutes: number) {
  return new Date(baseTime + minutes * 60_000).toISOString();
}

function story(
  id: string,
  minute: number,
  event: Omit<StoryEvent, "taskId" | "timestamp" | "type">,
) {
  return {
    id,
    stageName: `story:${event.kind}`,
    createdAt: at(minute),
    content: {
      type: "story",
      taskId: STORY_PREVIEW_TASK_ID,
      timestamp: at(minute),
      ...event,
    } satisfies StoryEvent,
  } satisfies StageOutputLike;
}

export const STORY_PREVIEW_TASK_ID = "story-preview-task";
export const STORY_PREVIEW_STATUS = "completed";

export const STORY_PREVIEW_OUTPUTS: StageOutputLike[] = [
  story("preview-war-start", 0, {
    kind: "scene_start",
    roomId: "war_room",
    sceneId: "war_room_brief",
    povAgentId: "chief",
    speakerId: "chief",
    message: "War Room dimulai.",
  }),
  story("preview-war-chief", 1, {
    kind: "agent_message",
    roomId: "war_room",
    sceneId: "war_room_brief",
    povAgentId: "chief",
    speakerId: "chief",
    targetIds: ["intelgen", "marketing"],
    message:
      "Bu Rani, mulai dari intelligence brief yang bisa dipakai. Pak Bima, standby untuk framing dan publish setelah saya review.",
  }),
  story("preview-intel-start", 2, {
    kind: "scene_start",
    roomId: "intelligence",
    sceneId: "intelligence_work",
    povAgentId: "intelgen",
    speakerId: "intelgen",
    message: "Intelgen mulai mencari sumber dan memvalidasi klaim.",
  }),
  story("preview-intel-message", 3, {
    kind: "agent_message",
    roomId: "intelligence",
    sceneId: "intelligence_work",
    povAgentId: "intelgen",
    speakerId: "intelgen",
    targetIds: ["chief"],
    message:
      "Pak Arga, brief intelligence sudah siap. Saya punya insight utama, sumber rujukan, dan batas klaim yang aman untuk Marketing.",
  }),
  story("preview-chief-handoff", 4, {
    kind: "agent_message",
    roomId: "war_room",
    sceneId: "war_room_handoff",
    povAgentId: "chief",
    speakerId: "chief",
    targetIds: ["marketing"],
    message:
      "Pak Bima, lanjutkan. Pakai brief Bu Rani, jaga klaim tetap presisi, lalu publish kalau visual sudah siap.",
  }),
  story("preview-marketing-start", 5, {
    kind: "scene_start",
    roomId: "marketing",
    sceneId: "marketing_work",
    povAgentId: "marketing",
    speakerId: "marketing",
    message: "Marketing mulai menyusun copy dan menyiapkan publish Instagram.",
  }),
  story("preview-marketing-message", 6, {
    kind: "agent_message",
    roomId: "marketing",
    sceneId: "marketing_work",
    povAgentId: "marketing",
    speakerId: "marketing",
    targetIds: ["chief"],
    message:
      "Pak Arga, copy final dan kesiapan visual sudah saya review. Status publish saya kembalikan apa adanya untuk keputusan akhir.",
  }),
  story("preview-final", 7, {
    kind: "result_card",
    roomId: "war_room",
    sceneId: "war_room_final",
    povAgentId: "chief",
    speakerId: "chief",
    message: "Hasil akhir siap ditinjau.",
    meta: {
      sourceStage: "marketing",
      finalOutput: {
        finalCopy:
          "AI di kantor mulai menang saat dipakai untuk meringankan kerja harian, bukan sekadar ikut tren.",
        postFormat: "Single Post",
        status: "pending_approval",
      },
    },
  }),
  {
    id: "preview-intelligence-report",
    stageName: "intelligence",
    createdAt: at(8),
    content: {
      executiveSummary:
        "Adopsi AI enterprise makin dipengaruhi ROI, keamanan data, dan integrasi operasional.",
      keyFacts: [
        "Pembeli makin sensitif ke ROI yang bisa diukur dalam 3-6 bulan.",
        "Governance dan keamanan data tetap menjadi hambatan utama.",
      ],
      referenceLinks: [
        "https://example.com/report/ai-enterprise-1",
        "https://example.com/report/ai-enterprise-2",
      ],
      status: "success",
    },
  },
  {
    id: "preview-marketing-report",
    stageName: "marketing",
    createdAt: at(9),
    content: {
      finalCopy:
        "AI di kantor bukan lagi soal siapa yang paling cepat ikut tren. Tim yang menang adalah tim yang membuat kerja harian lebih ringan, lebih cepat, dan lebih rapi.",
      postFormat: "Single Post",
      status: "pending_approval",
    },
  },
];
