/**
 * Native Agen Team graph.
 *
 * Runtime agents are intentionally limited to Chief, Intelgen, and Marketing.
 * Legacy stage names may still appear in persisted outputs, but execution no
 * longer enters researcher/QA/writer/social/operations nodes.
 */
import { Annotation, END, StateGraph } from "@langchain/langgraph";
import {
  chiefAgentNode,
  intelgenNode,
  marketingNode,
} from "./agents/nodes";
import { routeAfterNativeChief } from "./graph-routing";
import type {
  AgentDecision,
  AgentMessage,
  AuditReport,
  ChiefCheckpoint,
  ChiefFinalDecision,
  DivisionBrief,
  IntelDecision,
  IntelligenceBrief,
  MarketingDecision,
  MarketingReview,
  ModelProfile,
  ResearchReport,
  RevisionRequest,
} from "./schemas";
import { resolveModelProfile } from "./schemas";
import { clearBeatKeys, emitWarRoomBrief, type StoryContext } from "./story";
import type { ProgressEmitter } from "./utils/progress-emitter";

const AgentTeamAnnotation = Annotation.Root({
  taskId: Annotation<string>(),
  userId: Annotation<string>(),
  intent: Annotation<string>(),
  topic: Annotation<string>(),
  brief: Annotation<DivisionBrief>(),
  modelProfile: Annotation<ModelProfile>(),
  maxBudgetUsd: Annotation<number>(),
  maxTotalTokens: Annotation<number>(),
  researchRawOutput: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  auditResult: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  researchReport: Annotation<ResearchReport | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  auditReport: Annotation<AuditReport | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  intelDecision: Annotation<IntelDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  intelligenceBrief: Annotation<IntelligenceBrief | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  marketingDecision: Annotation<MarketingDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  marketingPrePublishDecision: Annotation<MarketingDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  marketingReview: Annotation<MarketingReview | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  chiefFinalDecision: Annotation<ChiefFinalDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  chiefCheckpoints: Annotation<ChiefCheckpoint[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  marketingRevisionCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  agentMessages: Annotation<AgentMessage[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  agentDecisions: Annotation<AgentDecision[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  revisionRequests: Annotation<RevisionRequest[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  researchRevisionCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentDraft: Annotation<any | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  publicationResult: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intelReport: Annotation<any | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketingReport: Annotation<any | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operationsReport: Annotation<any | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  totalTokensUsed: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  totalCostUsed: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  stages: Annotation<Array<{ stage: string; data: unknown }>>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "running",
  }),
  emitter: Annotation<ProgressEmitter>(),
});

type AgentTeamState = typeof AgentTeamAnnotation.State;

function cleanupTask(state: AgentTeamState) {
  clearBeatKeys(state.taskId);
  return {};
}

export function buildAgentTeamGraph() {
  const graph = new StateGraph(AgentTeamAnnotation)
    .addNode("chief", chiefAgentNode)
    .addNode("intelgen", intelgenNode)
    .addNode("marketing", marketingNode)
    .addNode("cleanup", cleanupTask)
    .addEdge("__start__", "chief")
    .addConditionalEdges("chief", routeAfterNativeChief, {
      intelgen: "intelgen",
      marketing: "marketing",
      end: "cleanup",
    })
    .addEdge("intelgen", "chief")
    .addEdge("marketing", "chief")
    .addEdge("cleanup", END);

  return graph.compile();
}

export async function executeAgentTeam(params: {
  taskId: string;
  userId: string;
  intent: string;
  topic: string;
  specialFocus?: string;
  maxBudgetUsd: number;
  maxTotalTokens: number;
  maxSources: number;
  needsPhoto: boolean;
  photoQuery?: string;
  userMemoryContext?: string;
  emitter: ProgressEmitter;
}): Promise<AgentTeamState> {
  const modelProfile = resolveModelProfile(params.intent, params.maxBudgetUsd);

  const brief: DivisionBrief = {
    taskId: params.taskId,
    topic: params.topic,
    specialFocus: params.specialFocus,
    photoRequirements: {
      needsPhoto: params.needsPhoto,
      photoQuery: params.photoQuery,
      quantityNeeded: 1,
    },
    additionalContext: params.userMemoryContext,
  };

  const ctx: StoryContext = {
    taskId: params.taskId,
    intentType: params.intent,
    topic: params.topic,
    taskPayload: brief,
  };

  await emitWarRoomBrief(params.emitter, ctx, {
    topic: params.topic,
    specialFocus: params.specialFocus,
  });

  return buildAgentTeamGraph().invoke({
    taskId: params.taskId,
    userId: params.userId,
    intent: params.intent,
    topic: params.topic,
    brief,
    modelProfile,
    maxBudgetUsd: params.maxBudgetUsd,
    maxTotalTokens: params.maxTotalTokens,
    researchRawOutput: "",
    auditResult: "",
    agentMessages: [],
    agentDecisions: [],
    revisionRequests: [],
    researchRevisionCount: 0,
    marketingRevisionCount: 0,
    chiefCheckpoints: [],
    stages: [],
    status: "running",
    emitter: params.emitter,
  });
}

export const __native3AgentTest = {
  routeAfterChief: routeAfterNativeChief,
};
