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
import type { ProgressEmitter } from "./utils/progress-emitter";

export interface AgentTeamState {
  // Identity
  taskId: string;
  userId: string;
  intent: string;
  topic: string;

  // Brief
  brief: DivisionBrief;

  // Model config
  modelProfile: ModelProfile;
  maxBudgetUsd: number;
  maxTotalTokens: number;

  // Intermediate outputs
  researchRawOutput: string;
  auditResult: string;
  researchReport?: ResearchReport;
  auditReport?: AuditReport;
  intelDecision?: IntelDecision;
  intelligenceBrief?: IntelligenceBrief;
  marketingDecision?: MarketingDecision;
  marketingPrePublishDecision?: MarketingDecision;
  marketingReview?: MarketingReview;
  chiefFinalDecision?: ChiefFinalDecision;
  chiefCheckpoints: ChiefCheckpoint[];
  marketingRevisionCount: number;
  agentMessages: AgentMessage[];
  agentDecisions: AgentDecision[];
  revisionRequests: RevisionRequest[];
  researchRevisionCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentDraft?: any;
  publicationResult?: string;

  // Final reports (typed as any to accept withStructuredOutput results)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intelReport?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketingReport?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operationsReport?: any;

  // Tracking
  totalTokensUsed: number;
  totalCostUsed: number;
  stages: Array<{ stage: string; data: unknown }>;
  status: string;

  // System
  emitter: ProgressEmitter;
}
