import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatMistralAI } from "@langchain/mistralai";
import type {
  AgentDecision,
  AgentMessage,
  ChiefCheckpoint,
  ChiefFinalDecision,
  ContentDraft,
  IntelDecision,
  IntelligenceFinalReport,
  MarketingDecision,
  MarketingFinalReport,
  MarketingReview,
  ResearchReport,
} from "../schemas";
import {
  ChiefFinalDecisionSchema,
  ContentDraftSchema,
  IntelHeadNativeOutputSchema,
  MarketingFinalReportSchema,
  MarketingReviewSchema,
  ResearchReportSchema,
} from "../schemas";
import type { AgentTeamState } from "../state";
import {
  emitChiefCheckpoint,
  emitIntelligenceClose,
  emitIntelligenceOpen,
  emitIntelRevisionRequest,
  emitMarketingClose,
  emitMarketingOpen,
  emitMarketingPrePublishDecision,
  emitResearchDone,
  emitResearchStart,
  emitResearchTyping,
  emitSocialDone,
  emitSocialTyping,
  emitSocialUploadStart,
  emitStoryBeat,
  emitWarRoomFinal,
  emitWarRoomHandoff,
  emitWriterDone,
  emitWriterStart,
  emitWriterTyping,
  type StoryContext,
} from "../story";
import { downloadImageTool, setTaskContext } from "../tools/download-image";
import {
  exaImageSearchTool,
  exaWebSearchTool,
  isExaAvailable,
} from "../tools/exa-search";
import { publishInstagramFromPayload } from "../tools/instagram-publisher";
import {
  isTavilyAvailable,
  tavilyFactCheckTool,
  tavilyWebSearchTool,
} from "../tools/tavily-search";

function getLLM(modelName: string, temperature = 0.2) {
  return new ChatMistralAI({ model: modelName, temperature });
}

function buildStoryCtx(state: AgentTeamState): StoryContext {
  return {
    taskId: state.taskId,
    intentType: state.intent,
    topic: state.topic,
  };
}

function makeAgentMessage(params: {
  fromAgent: AgentMessage["fromAgent"];
  toAgents?: AgentMessage["toAgents"];
  sceneId: string;
  content: string;
  basedOn?: string[];
}): AgentMessage {
  return {
    id: crypto.randomUUID(),
    fromAgent: params.fromAgent,
    toAgents: params.toAgents ?? [],
    sceneId: params.sceneId,
    content: params.content,
    basedOn: params.basedOn ?? [],
    timestamp: new Date().toISOString(),
  };
}

function makeAgentDecision(params: {
  agentId: AgentDecision["agentId"];
  decision: AgentDecision["decision"];
  confidence?: number;
  reason: string;
  nextOwner?: AgentDecision["nextOwner"];
  requiredChanges?: string[];
}): AgentDecision {
  return {
    agentId: params.agentId,
    decision: params.decision,
    confidence: clamp(params.confidence ?? 0.5),
    reason: params.reason,
    nextOwner: params.nextOwner,
    requiredChanges: params.requiredChanges ?? [],
  };
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function extractJsonObject(input: string) {
  return input.match(/\{[\s\S]*\}/)?.[0] || input;
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function uniqueStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    : [];
}

function compact(value: unknown, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function parseResearchReport(rawContent: string, state: AgentTeamState): ResearchReport {
  const parsed = parseJsonRecord(rawContent);
  const keyFindings = uniqueStrings(parsed.keyFindings);
  const sources = uniqueStrings(parsed.sources);
  const caveats = uniqueStrings(parsed.caveats);
  const candidate = ResearchReportSchema.safeParse({
    taskId: state.taskId,
    status:
      parsed.status === "success" ||
      parsed.status === "partial" ||
      parsed.status === "failed"
        ? parsed.status
        : keyFindings.length > 0
          ? sources.length > 0
            ? "success"
            : "partial"
          : "failed",
    keyFindings:
      keyFindings.length > 0
        ? keyFindings
        : [`Belum ada temuan kuat untuk ${state.topic}.`],
    sources,
    rawSummary:
      typeof parsed.rawSummary === "string"
        ? parsed.rawSummary
        : rawContent.slice(0, 1800),
    mediaAssets: Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets : [],
    researcherNotes:
      typeof parsed.researcherNotes === "string"
        ? parsed.researcherNotes
        : undefined,
    confidence:
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : sources.length >= 2
          ? 0.78
          : sources.length === 1
            ? 0.58
            : 0.35,
    caveats:
      caveats.length > 0
        ? caveats
        : sources.length >= 2
          ? []
          : ["Sumber masih terbatas; klaim harus dibuat hati-hati."],
    utterance:
      typeof parsed.utterance === "string" ? parsed.utterance : undefined,
  });
  return candidate.success
    ? candidate.data
    : {
        taskId: state.taskId,
        status: "partial",
        keyFindings,
        sources,
        rawSummary: rawContent.slice(0, 1800),
        mediaAssets: [],
        confidence: 0.45,
        caveats: ["Output riset tidak sepenuhnya valid."],
      };
}

function buildFallbackIntelOutput(
  state: AgentTeamState,
  report: ResearchReport,
): {
  report: IntelligenceFinalReport;
  decision: IntelDecision;
} {
  const enough = report.status !== "failed" && report.confidence >= 0.45;
  const shouldRevise = !enough && state.researchRevisionCount < 2;
  return {
    report: {
      taskId: state.taskId,
      status: enough ? "success" : shouldRevise ? "partial_fail" : "failed",
      executiveSummary: report.rawSummary,
      keyFacts: report.keyFindings,
      referenceLinks: report.sources,
      mediaAssets: report.mediaAssets,
      tokenUsage: 0,
      durationSeconds: 0,
    },
    decision: {
      decision: enough
        ? "approve_to_marketing"
        : shouldRevise
          ? "revise_research"
          : "stop_low_confidence",
      confidence: clamp(report.confidence),
      reason: enough
        ? "Intelgen punya bahan yang cukup untuk Marketing."
        : "Intelgen belum punya bahan dengan confidence cukup.",
      requiredChanges: enough
        ? []
        : ["Perkuat sumber dan ringkas klaim utama dengan lebih jelas."],
      utterance: enough
        ? `Pak Arga, bahan Intelgen untuk ${state.topic} siap dipakai Marketing.`
        : `Pak Arga, bahan Intelgen untuk ${state.topic} belum cukup kuat.`,
      intelligenceBrief: enough
        ? {
            coreAngle: report.keyFindings[0] ?? state.topic,
            allowedClaims: report.keyFindings,
            bannedClaims: report.caveats,
            riskFrame:
              report.caveats[0] ??
              "Gunakan wording yang hati-hati dan tidak overclaim.",
            marketingGuidance:
              "Turunkan insight menjadi caption Instagram yang ringkas, jelas, dan tidak berlebihan.",
          }
        : undefined,
    },
  };
}

function normalizeIntelOutput(value: unknown, fallback: ReturnType<typeof buildFallbackIntelOutput>) {
  const parsed = IntelHeadNativeOutputSchema.safeParse(value);
  if (!parsed.success) return fallback;
  return parsed.data;
}

async function runToolLoop(args: {
  llm: ChatMistralAI;
  tools: any[];
  system: string;
  prompt: string;
  maxIterations: number;
}) {
  const llmWithTools = args.llm.bindTools(args.tools);
  const messages: any[] = [
    new SystemMessage(args.system),
    new HumanMessage(args.prompt),
  ];
  for (let i = 0; i < args.maxIterations; i++) {
    const response = await llmWithTools.invoke(messages);
    messages.push(response);
    if (!response.tool_calls || response.tool_calls.length === 0) break;
    for (const toolCall of response.tool_calls) {
      const tool = args.tools.find((item) => item.name === toolCall.name);
      let content = `Tool ${toolCall.name} not found`;
      try {
        if (tool) content = await tool.invoke(toolCall.args as any);
      } catch (error) {
        content =
          error instanceof Error ? `Tool error: ${error.message}` : "Tool error";
      }
      messages.push({ role: "tool", content, tool_call_id: toolCall.id });
    }
  }
  const last = messages[messages.length - 1];
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}

export async function intelgenNode(
  state: AgentTeamState,
): Promise<Partial<AgentTeamState>> {
  const ctx = buildStoryCtx(state);
  await emitIntelligenceOpen(state.emitter, ctx);
  await emitResearchStart(state.emitter, ctx);
  await emitResearchTyping(state.emitter, ctx);

  setTaskContext(state.taskId);
  const tools: any[] = [downloadImageTool];
  if (isTavilyAvailable()) tools.unshift(tavilyWebSearchTool, tavilyFactCheckTool);
  if (isExaAvailable()) tools.unshift(exaWebSearchTool, exaImageSearchTool);
  if (!isTavilyAvailable() && !isExaAvailable()) {
    throw new Error("Intelgen needs TAVILY_API_KEY or EXA_API_KEY.");
  }

  const revision = state.revisionRequests.at(-1);
  const rawResearch = await runToolLoop({
    llm: getLLM(state.modelProfile.intelgenModel, 0.2),
    tools,
    maxIterations: 6,
    system:
      "Anda adalah Intelgen Agent. Anda melakukan riset, fact-checking, dan mencari visual jika diperlukan. Gunakan tool seperlunya dan jangan mengarang sumber.",
    prompt: `Task: ${state.topic}
Brief: ${JSON.stringify(state.brief)}
Intent: ${state.intent}
Revisi Chief: ${revision ? `${revision.reason}; ${revision.requiredChanges.join("; ")}` : "Tidak ada"}

Kembalikan JSON ResearchReport dengan field taskId, status, keyFindings, sources, rawSummary, mediaAssets, confidence, caveats, utterance.`,
  });

  const researchReport = parseResearchReport(rawResearch, state);
  await emitResearchDone(state.emitter, ctx, {
    research: {
      keyFindings: researchReport.keyFindings,
      sourceCount: researchReport.sources.length,
      agentMessage:
        researchReport.utterance ??
        `Pak Arga, Intelgen menemukan ${researchReport.keyFindings.length} temuan dan ${researchReport.sources.length} sumber.`,
    },
  });

  const fallback = buildFallbackIntelOutput(state, researchReport);
  let intelOutput = fallback;
  try {
    const structured = getLLM(
      state.modelProfile.intelgenModel,
      0.1,
    ).withStructuredOutput(IntelHeadNativeOutputSchema);
    intelOutput = normalizeIntelOutput(
      await structured.invoke([
        new SystemMessage(
          "Anda adalah Intelgen Agent. Gabungkan riset dan validasi menjadi IntelligenceFinalReport + IntelDecision.",
        ),
        new HumanMessage(
          `ResearchReport:
${JSON.stringify(researchReport, null, 2)}

Aturan:
- approve_to_marketing jika bahan cukup aman.
- revise_research jika masih bisa diperbaiki dan revisi belum lebih dari 2.
- stop_low_confidence jika terlalu lemah.
- Jika approve, isi intelligenceBrief.`,
        ),
      ]),
      fallback,
    );
  } catch {
    intelOutput = fallback;
  }

  await emitIntelligenceClose(state.emitter, ctx, {
    intel: {
      strongestInsights: intelOutput.report.keyFacts,
      agentMessage: intelOutput.decision.utterance,
    },
  });

  const nextRevisionCount =
    intelOutput.decision.decision === "revise_research"
      ? state.researchRevisionCount + 1
      : state.researchRevisionCount;
  const message = makeAgentMessage({
    fromAgent: "intelgen",
    toAgents: ["chief"],
    sceneId: "intelligence_work",
    content:
      intelOutput.decision.utterance ??
      `Intelgen decision: ${intelOutput.decision.decision}`,
    basedOn: ["researchReport", "intelDecision"],
  });
  const decision = makeAgentDecision({
    agentId: "intelgen",
    decision:
      intelOutput.decision.decision === "approve_to_marketing"
        ? "approve"
        : intelOutput.decision.decision === "revise_research"
          ? "revise"
          : "stop",
    confidence: intelOutput.decision.confidence,
    reason: intelOutput.decision.reason,
    nextOwner:
      intelOutput.decision.decision === "approve_to_marketing"
        ? "chief"
        : "intelgen",
    requiredChanges: intelOutput.decision.requiredChanges,
  });

  return {
    researchRawOutput: rawResearch,
    researchReport,
    intelReport: intelOutput.report,
    intelDecision: intelOutput.decision,
    intelligenceBrief: intelOutput.decision.intelligenceBrief,
    researchRevisionCount: nextRevisionCount,
    agentMessages: [...state.agentMessages, message],
    agentDecisions: [...state.agentDecisions, decision],
    stages: [
      ...state.stages,
      { stage: "intelgen", data: { report: intelOutput.report, decision: intelOutput.decision, researchReport, native: true } },
      { stage: "intelligence", data: intelOutput.report },
    ],
  };
}

function normalizeCaptionDraft(value: unknown, state: AgentTeamState): ContentDraft {
  const parsed = ContentDraftSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return {
    taskId: state.taskId,
    hook: `Hal penting tentang ${state.topic}`,
    body:
      state.intelligenceBrief?.marketingGuidance ??
      state.intelReport?.executiveSummary ??
      `Konten ringkas tentang ${state.topic}.`,
    cta: "Simpan postingan ini kalau kamu ingin menjadikannya referensi.",
    hashtags: ["#Instagram", "#Edukasi", "#Konten"],
    postFormat: "single_post",
    usedMediaAssetIds: [],
  };
}

function buildCaptionText(draft: ContentDraft) {
  return [draft.hook, draft.body, draft.cta, draft.hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 900);
}

function parsePublicationResult(value: string | undefined) {
  if (!value || value === "draft_only") {
    return { ok: false, status: "drafted" as const, error: "", url: "" };
  }
  if (value.startsWith("PUBLISH_FAILED")) {
    return {
      ok: false,
      status: "failed_publish" as const,
      error: value.replace(/^PUBLISH_FAILED:\s*/i, "").trim(),
      url: "",
    };
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const url =
      typeof parsed.publicationUrl === "string"
        ? parsed.publicationUrl
        : typeof parsed.permalink === "string"
          ? parsed.permalink
          : "";
    const ok =
      parsed.status === "published" ||
      parsed.status === "success" ||
      Boolean(url) ||
      typeof parsed.mediaId === "string";
    return {
      ok,
      status: ok ? ("published" as const) : ("failed_publish" as const),
      error: ok
        ? ""
        : String(parsed.error ?? parsed.errorReason ?? parsed.reason ?? ""),
      url,
    };
  } catch {
    const ok = /published|success/i.test(value);
    return {
      ok,
      status: ok ? ("published" as const) : ("failed_publish" as const),
      error: ok ? "" : value,
      url: "",
    };
  }
}

function getPublishableImageUrl(state: AgentTeamState) {
  const mediaAssets = Array.isArray(state.intelReport?.mediaAssets)
    ? state.intelReport.mediaAssets
    : [];
  for (const asset of mediaAssets) {
    if (!asset || typeof asset !== "object") continue;
    const record = asset as Record<string, unknown>;
    for (const key of ["fallbackUrl", "originalUrl", "url"]) {
      const value = record[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value)) {
        return value;
      }
    }
  }
  return process.env.AGEN_TEAM_DEFAULT_INSTAGRAM_IMAGE_URL?.trim() || "";
}

function buildMarketingDecision(args: {
  intent: string;
  publicationResult?: string;
  review?: MarketingReview;
}): MarketingDecision {
  if (args.review?.overallVerdict === "reject") {
    return {
      decision: "revise_caption",
      confidence: 0.82,
      reason: args.review.improvementNotes[0] ?? "Marketing review rejected the draft.",
      requiredChanges: args.review.improvementNotes,
    };
  }
  if (args.intent !== "full_auto_publish") {
    return {
      decision: "approve_draft",
      confidence: 0.8,
      reason: "Draft siap ditinjau user.",
      requiredChanges: [],
    };
  }
  const result = parsePublicationResult(args.publicationResult);
  return result.ok
    ? {
        decision: "approve_publish_result",
        confidence: 0.9,
        reason: "Instagram mengembalikan hasil publish sukses.",
        requiredChanges: [],
      }
    : {
        decision: "stop_publish_failed",
        confidence: 0.75,
        reason: result.error || "Instagram belum mengembalikan publish sukses.",
        requiredChanges: ["Periksa koneksi Instagram, visual, dan raw publish error sebelum retry."],
      };
}

export async function marketingNode(
  state: AgentTeamState,
): Promise<Partial<AgentTeamState>> {
  const ctx = buildStoryCtx(state);
  await emitMarketingOpen(state.emitter, ctx);
  await emitWriterStart(state.emitter, ctx);
  await emitWriterTyping(state.emitter, ctx);

  const llm = getLLM(state.modelProfile.marketingModel, 0.65);
  const structuredDraft = llm.withStructuredOutput(ContentDraftSchema);
  let draft: ContentDraft;
  try {
    draft = normalizeCaptionDraft(
      await structuredDraft.invoke([
        new SystemMessage(
          "Anda adalah Marketing Agent. Buat caption Instagram berdasarkan intelligence brief. Jangan memakai klaim yang dilarang.",
        ),
        new HumanMessage(
          `Task: ${state.topic}
Brief: ${JSON.stringify(state.brief)}
Intel report: ${JSON.stringify(state.intelReport)}
Intelligence brief: ${JSON.stringify(state.intelligenceBrief)}
Revision request: ${JSON.stringify(state.revisionRequests.at(-1) ?? null)}

Kembalikan ContentDraft.`,
        ),
      ]),
      state,
    );
  } catch {
    draft = normalizeCaptionDraft(null, state);
  }
  const caption = buildCaptionText(draft);
  await emitWriterDone(state.emitter, ctx, {
    writer: {
      captionPreview: compact(caption, 140),
      agentMessage: `Pak Arga, draft Marketing sudah siap. Preview: ${compact(caption, 140)}`,
    },
  });

  let marketingReview: MarketingReview | undefined;
  try {
    const reviewLlm = getLLM(state.modelProfile.marketingModel, 0.15).withStructuredOutput(MarketingReviewSchema);
    marketingReview = (await reviewLlm.invoke([
      new SystemMessage(
        "Anda adalah Marketing Agent yang mengaudit caption sendiri sebelum publish.",
      ),
      new HumanMessage(
        `Caption:
${caption}

Intel brief:
${JSON.stringify(state.intelligenceBrief)}

Kembalikan MarketingReview. Reject jika ada klaim terlarang atau caption tidak align.`,
      ),
    ])) as MarketingReview;
  } catch {
    marketingReview = {
      positioningScore: 0.7,
      audienceFitScore: 0.7,
      hookStrengthScore: 0.7,
      briefAlignmentScore: 0.7,
      overallVerdict: "acceptable",
      improvementNotes: [],
      bannedClaimViolations: [],
    };
  }

  let prePublishDecision: MarketingDecision = {
    decision:
      marketingReview.overallVerdict === "reject"
        ? "revise_caption"
        : state.intent === "full_auto_publish"
          ? "approve_to_publish"
          : "approve_draft",
    confidence: marketingReview.overallVerdict === "reject" ? 0.8 : 0.82,
    reason:
      marketingReview.overallVerdict === "reject"
        ? marketingReview.improvementNotes[0] ?? "Caption perlu revisi."
        : "Caption layak untuk mode task ini.",
    requiredChanges: marketingReview.improvementNotes,
  };
  const nextMarketingRevisionCount =
    prePublishDecision.decision === "revise_caption"
      ? state.marketingRevisionCount + 1
      : state.marketingRevisionCount;
  if (
    prePublishDecision.decision === "revise_caption" &&
    state.marketingRevisionCount >= 1
  ) {
    prePublishDecision = {
      decision: "stop_not_publishable",
      confidence: 0.78,
      reason: "Caption masih ditolak setelah revisi Marketing.",
      requiredChanges: prePublishDecision.requiredChanges,
    };
  }
  await emitMarketingPrePublishDecision(state.emitter, ctx, {
    message: `Pak Arga, keputusan Marketing: ${prePublishDecision.decision}. ${prePublishDecision.reason}`,
    decision: prePublishDecision.decision,
    requiredChanges: prePublishDecision.requiredChanges,
    revisionCount: nextMarketingRevisionCount,
    marketingReview: marketingReview as unknown as Record<string, unknown>,
  });

  let publicationResult = "draft_only";
  if (prePublishDecision.decision === "approve_to_publish") {
    await emitSocialTyping(state.emitter, ctx);
    const imageUrl = getPublishableImageUrl(state);
    await emitSocialUploadStart(state.emitter, ctx, {
      social: {
        imageUrl,
        visualSource: imageUrl ? "visual dari Intelgen/default" : "tidak ada visual tersedia",
      },
    });
    publicationResult = await publishInstagramFromPayload(
      JSON.stringify({
        userId: state.userId,
        topic: state.topic,
        caption,
        image_url: imageUrl,
        postFormat: draft.postFormat,
      }),
    );
    await emitSocialDone(state.emitter, ctx, {
      social: {
        publicationResult,
        imageUrl,
        agentMessage: `Pak Arga, status publish Marketing: ${compact(publicationResult, 180)}`,
      },
    });
  } else if (prePublishDecision.decision === "stop_not_publishable") {
    publicationResult = `PUBLISH_FAILED: ${prePublishDecision.reason}`;
  }

  const publishState = parsePublicationResult(publicationResult);
  let report: MarketingFinalReport = {
    taskId: state.taskId,
    status:
      state.intent === "full_auto_publish"
        ? publishState.status
        : "drafted",
    finalCopy: caption,
    postFormat: draft.postFormat,
    usedMediaAssetIds: draft.usedMediaAssetIds,
    publicationUrl: publishState.url || undefined,
    errorReason: publishState.error || undefined,
    tokenUsage: 0,
  };
  try {
    report = MarketingFinalReportSchema.parse(report);
  } catch {
    report = {
      taskId: state.taskId,
      status: "failed_publish",
      finalCopy: caption,
      postFormat: draft.postFormat,
      usedMediaAssetIds: draft.usedMediaAssetIds,
      errorReason: "Marketing report failed schema validation.",
      tokenUsage: 0,
    };
  }

  const finalMarketingDecision = buildMarketingDecision({
    intent: state.intent,
    publicationResult,
    review: marketingReview,
  });
  await emitMarketingClose(state.emitter, ctx, {
    marketing: {
      agentMessage:
        finalMarketingDecision.decision === "approve_publish_result"
          ? "Pak Arga, Marketing selesai dan publish Instagram berhasil."
          : `Pak Arga, Marketing selesai dengan status: ${finalMarketingDecision.decision}. ${finalMarketingDecision.reason}`,
    },
  });

  const message = makeAgentMessage({
    fromAgent: "marketing",
    toAgents: ["chief"],
    sceneId: "marketing_work",
    content:
      finalMarketingDecision.utterance ??
      `Marketing decision: ${finalMarketingDecision.decision}. ${finalMarketingDecision.reason}`,
    basedOn: ["contentDraft", "marketingReview", "publicationResult"],
  });
  const decision = makeAgentDecision({
    agentId: "marketing",
    decision:
      finalMarketingDecision.decision === "approve_publish_result" ||
      finalMarketingDecision.decision === "approve_draft"
        ? "approve"
        : finalMarketingDecision.decision === "revise_caption"
          ? "revise"
          : "stop",
    confidence: finalMarketingDecision.confidence,
    reason: finalMarketingDecision.reason,
    nextOwner: "chief",
    requiredChanges: finalMarketingDecision.requiredChanges,
  });

  return {
    contentDraft: draft,
    marketingReview,
    marketingPrePublishDecision: prePublishDecision,
    marketingDecision: finalMarketingDecision,
    marketingRevisionCount: nextMarketingRevisionCount,
    publicationResult,
    marketingReport: report,
    agentMessages: [...state.agentMessages, message],
    agentDecisions: [...state.agentDecisions, decision],
    stages: [
      ...state.stages,
      { stage: "marketing", data: { report, decision: finalMarketingDecision, review: marketingReview, publicationResult, native: true } },
    ],
  };
}

export async function chiefAgentNode(
  state: AgentTeamState,
): Promise<Partial<AgentTeamState>> {
  const ctx = buildStoryCtx(state);

  if (state.intent === "ask_operations_cost") {
    const decision: ChiefFinalDecision = {
      final_status: "failed",
      verdict: "Operations dinonaktifkan",
      reason: "Runtime Agen Team sekarang hanya memiliki Chief, Intelgen, dan Marketing.",
      user_facing_summary:
        "Mode operasi/finance sedang dinonaktifkan di arsitektur 3-agent.",
      required_follow_up: [],
      utterance:
        "Mode operasi/finance sedang saya nonaktifkan. Runtime ini hanya memakai Chief, Intelgen, dan Marketing.",
    };
    await emitWarRoomFinal(state.emitter, ctx, {
      hasMarketing: false,
      finalOutput: decision,
      sourceStage: "chief",
      dynamic: { final: { chiefMessage: decision.utterance, resultTitle: decision.verdict } },
    });
    return {
      chiefFinalDecision: decision,
      status: "failed",
      stages: [...state.stages, { stage: "chief_final_review", data: { decision } }],
    };
  }

  if (!state.intelDecision) {
    const message = "Bu Rani, mulai dari Intelgen. Cari sumber, cek klaim, dan siapkan brief untuk Marketing.";
    await emitStoryBeat(state.emitter, ctx, {
      kind: "agent_message",
      sceneId: "war_room_brief",
      speakerId: "chief",
      targetIds: ["intelgen"],
      mentions: ["intelgen"],
      message,
      meta: { beatKey: "chief:route:intelgen" },
    });
    return {
      agentMessages: [
        ...state.agentMessages,
        makeAgentMessage({
          fromAgent: "chief",
          toAgents: ["intelgen"],
          sceneId: "war_room_brief",
          content: message,
          basedOn: ["brief"],
        }),
      ],
      agentDecisions: [
        ...state.agentDecisions,
        makeAgentDecision({
          agentId: "chief",
          decision: "continue",
          confidence: 0.9,
          reason: "Task dimulai dari Intelgen.",
          nextOwner: "intelgen",
        }),
      ],
    };
  }

  if (state.intelDecision.decision === "revise_research") {
    await emitIntelRevisionRequest(state.emitter, ctx, {
      reason: state.intelDecision.reason,
      requiredChanges: state.intelDecision.requiredChanges,
      attempt: state.researchRevisionCount + 1,
    });
    return {
      revisionRequests: [
        ...state.revisionRequests,
        {
          fromAgent: "chief",
          toAgent: "intelgen",
          reason: state.intelDecision.reason,
          requiredChanges: state.intelDecision.requiredChanges,
          attempt: state.researchRevisionCount + 1,
        },
      ],
      agentDecisions: [
        ...state.agentDecisions,
        makeAgentDecision({
          agentId: "chief",
          decision: "revise",
          confidence: state.intelDecision.confidence,
          reason: state.intelDecision.reason,
          nextOwner: "intelgen",
          requiredChanges: state.intelDecision.requiredChanges,
        }),
      ],
    };
  }

  if (state.intelDecision.decision === "stop_low_confidence") {
    return finalizeChief(state, "Intelgen menghentikan task karena confidence rendah.");
  }

  if (!state.marketingDecision) {
    const checkpoint: ChiefCheckpoint = {
      checkpoint: "post_intel",
      proceed: true,
      concern: null,
      guidance: "Marketing boleh lanjut memakai intelligence brief.",
      utterance: "Intelgen cukup kuat. Pak Bima, lanjutkan ke Marketing.",
    };
    await emitChiefCheckpoint(state.emitter, ctx, checkpoint);
    await emitWarRoomHandoff(state.emitter, ctx, {
      intel: {
        warRoomReportMessage:
          state.intelDecision.utterance ??
          "Pak Arga, bahan Intelgen sudah siap untuk Marketing.",
      },
    });
    return {
      chiefCheckpoints: [...state.chiefCheckpoints, checkpoint],
      stages: [...state.stages, { stage: "chief_checkpoint_post_intel", data: checkpoint }],
      agentDecisions: [
        ...state.agentDecisions,
        makeAgentDecision({
          agentId: "chief",
          decision: "approve",
          confidence: state.intelDecision.confidence,
          reason: "Intelgen approved to Marketing.",
          nextOwner: "marketing",
        }),
      ],
    };
  }

  if (state.marketingDecision.decision === "revise_caption") {
    await emitChiefCheckpoint(state.emitter, ctx, {
      checkpoint: "post_marketing_prepublish",
      proceed: false,
      concern: state.marketingDecision.reason,
      guidance: state.marketingDecision.requiredChanges.join("; ") || null,
      utterance: `Pak Bima, revisi Marketing dulu: ${state.marketingDecision.reason}`,
    });
    return {
      revisionRequests: [
        ...state.revisionRequests,
        {
          fromAgent: "chief",
          toAgent: "marketing",
          reason: state.marketingDecision.reason,
          requiredChanges: state.marketingDecision.requiredChanges,
          attempt: state.marketingRevisionCount + 1,
        },
      ],
      agentDecisions: [
        ...state.agentDecisions,
        makeAgentDecision({
          agentId: "chief",
          decision: "revise",
          confidence: state.marketingDecision.confidence,
          reason: state.marketingDecision.reason,
          nextOwner: "marketing",
          requiredChanges: state.marketingDecision.requiredChanges,
        }),
      ],
    };
  }

  return finalizeChief(state);
}

async function finalizeChief(
  state: AgentTeamState,
  forcedReason?: string,
): Promise<Partial<AgentTeamState>> {
  const fallback = buildFallbackChiefFinalDecision(state, forcedReason);
  let decision = fallback;
  try {
    const structured = getLLM(
      state.modelProfile.chiefModel,
      0.1,
    ).withStructuredOutput(ChiefFinalDecisionSchema);
    decision = (await structured.invoke([
      new SystemMessage(
        "Anda adalah Chief Agent. Beri final verdict berdasarkan fakta runtime. Jangan klaim publish sukses jika publicationResult gagal.",
      ),
      new HumanMessage(
        `Intel decision: ${JSON.stringify(state.intelDecision)}
Marketing decision: ${JSON.stringify(state.marketingDecision)}
Marketing report: ${JSON.stringify(state.marketingReport)}
Publication result: ${state.publicationResult}
Fallback: ${JSON.stringify(fallback)}

Kembalikan ChiefFinalDecision.`,
      ),
    ])) as ChiefFinalDecision;
  } catch {
    decision = fallback;
  }
  const failed = decision.final_status === "failed";
  await emitWarRoomFinal(state.emitter, buildStoryCtx(state), {
    hasMarketing: Boolean(state.marketingReport),
    finalOutput: state.marketingReport ?? state.intelReport ?? decision,
    sourceStage: state.marketingReport ? "marketing" : "intelligence",
    dynamic: {
      final: {
        chiefMessage: decision.utterance,
        marketingHeadMessage:
          state.marketingDecision?.reason ??
          "Marketing report sudah tersedia untuk Chief.",
        resultTitle: decision.verdict,
      },
    },
  });
  return {
    chiefFinalDecision: decision,
    status: failed ? "failed" : "success",
    agentMessages: [
      ...state.agentMessages,
      makeAgentMessage({
        fromAgent: "chief",
        toAgents: state.marketingReport ? ["marketing", "intelgen"] : ["intelgen"],
        sceneId: "war_room_final",
        content: decision.utterance,
        basedOn: ["intelDecision", "marketingDecision", "publicationResult"],
      }),
    ],
    agentDecisions: [
      ...state.agentDecisions,
      makeAgentDecision({
        agentId: "chief",
        decision: failed ? "stop" : "approve",
        confidence: failed ? 0.78 : 0.9,
        reason: decision.reason,
      }),
    ],
    stages: [...state.stages, { stage: "chief_final_review", data: { decision } }],
  };
}

function buildFallbackChiefFinalDecision(
  state: AgentTeamState,
  forcedReason?: string,
): ChiefFinalDecision {
  if (forcedReason) {
    return {
      final_status: "failed",
      verdict: "Task dihentikan",
      reason: forcedReason,
      user_facing_summary: forcedReason,
      required_follow_up: ["Perbaiki brief atau jalankan ulang setelah bahan lebih kuat."],
      utterance: forcedReason,
    };
  }
  const publishState = parsePublicationResult(state.publicationResult);
  if (state.intent === "full_auto_publish") {
    if (publishState.ok) {
      return {
        final_status: "success",
        verdict: "Upload Instagram berhasil",
        reason: "Marketing menerima hasil publish sukses dari Instagram.",
        user_facing_summary: "Upload Instagram berhasil.",
        required_follow_up: [],
        utterance: "Pak Bima, Bu Rani, saya terima hasil akhirnya. Upload Instagram berhasil.",
      };
    }
    return {
      final_status: "failed",
      verdict: "Upload Instagram gagal",
      reason:
        publishState.error ||
        state.marketingDecision?.reason ||
        "Instagram belum mengembalikan status publish sukses.",
      user_facing_summary:
        publishState.error ||
        "Materi selesai, tetapi upload Instagram belum berhasil.",
      required_follow_up: ["Periksa koneksi Instagram, visual, dan raw publish error sebelum retry."],
      utterance: `Saya tutup sebagai gagal publish: ${publishState.error || state.marketingDecision?.reason || "status publish tidak sukses"}`,
    };
  }
  return {
    final_status: state.marketingReport ? "needs_user_review" : "success",
    verdict: state.marketingReport ? "Draft siap ditinjau" : "Intelgen selesai",
    reason: "Runtime 3-agent selesai tanpa error terminal.",
    user_facing_summary: `Task tentang ${state.topic} selesai.`,
    required_follow_up: [],
    utterance: `Task tentang ${state.topic} selesai dan siap ditampilkan.`,
  };
}

// Legacy export names are intentionally removed from the active graph. They
// remain as throwing stubs so accidental imports fail loudly during dev.
export async function researcherNode(): Promise<never> {
  throw new Error("researcherNode is deprecated; use intelgenNode.");
}
export async function auditorNode(): Promise<never> {
  throw new Error("auditorNode is deprecated; use intelgenNode.");
}
export async function intelHeadNode(): Promise<never> {
  throw new Error("intelHeadNode is deprecated; use intelgenNode.");
}
export async function writerNode(): Promise<never> {
  throw new Error("writerNode is deprecated; use marketingNode.");
}
export async function marketingPrePublishNode(): Promise<never> {
  throw new Error("marketingPrePublishNode is deprecated; use marketingNode.");
}
export async function socialMediaNode(): Promise<never> {
  throw new Error("socialMediaNode is deprecated; use marketingNode.");
}
export async function marketingHeadNode(): Promise<never> {
  throw new Error("marketingHeadNode is deprecated; use marketingNode.");
}
export async function financeNode(): Promise<never> {
  throw new Error("financeNode is disabled in native 3-agent mode.");
}
export const chiefPostIntelCheckpointNode = chiefAgentNode;
export const chiefPostPrePublishCheckpointNode = chiefAgentNode;
