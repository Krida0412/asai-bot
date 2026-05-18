/**
 * Zod Schemas for Agen Team — ported from python-engine/app/models/schemas.py
 * These are the source of truth for data contracts between agents.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. Photo Requirements
// ---------------------------------------------------------------------------
export const PhotoRequirementsSchema = z.object({
  needsPhoto: z.boolean().default(false),
  photoQuery: z.string().optional(),
  quantityNeeded: z.number().int().default(1),
});
export type PhotoRequirements = z.infer<typeof PhotoRequirementsSchema>;

// ---------------------------------------------------------------------------
// 2. Division Brief (Chief → Division Heads)
// ---------------------------------------------------------------------------
export const DivisionBriefSchema = z.object({
  taskId: z.string(),
  topic: z.string(),
  specialFocus: z.string().optional(),
  photoRequirements: PhotoRequirementsSchema.default({
    needsPhoto: false,
    quantityNeeded: 1,
  }),
  additionalContext: z.string().optional(),
});
export type DivisionBrief = z.infer<typeof DivisionBriefSchema>;

// ---------------------------------------------------------------------------
// 3. Media Asset
// ---------------------------------------------------------------------------
export const MediaAssetSchema = z.object({
  assetId: z.string().default(() => crypto.randomUUID()),
  searchQueryUsed: z.string(),
  originalUrl: z.string(),
  downloadStatus: z.enum(["downloaded", "fallback_url", "failed"]),
  localPath: z.string().optional(),
  fallbackUrl: z.string().optional(),
  format: z.enum(["jpg", "png", "webp"]).optional(),
  estimatedResolution: z.string().optional(),
  relevanceNote: z.string().default(""),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

// ---------------------------------------------------------------------------
// 4. Research Report (Researcher → Auditor)
// ---------------------------------------------------------------------------
export const ResearchReportSchema = z.object({
  taskId: z.string(),
  status: z.enum(["success", "partial", "failed"]),
  keyFindings: z.array(z.string()),
  sources: z.array(z.string()),
  rawSummary: z.string(),
  mediaAssets: z.array(MediaAssetSchema).default([]),
  researcherNotes: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  caveats: z.array(z.string()).default([]),
  utterance: z.string().optional(),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

// ---------------------------------------------------------------------------
// 5. Audit Report (Auditor → Head of Intelligence)
// ---------------------------------------------------------------------------
export const IndependentVerificationSchema = z.object({
  verifiedClaims: z.array(z.string()).default([]),
  contradictedClaims: z.array(z.string()).default([]),
  verificationSources: z.array(z.string()).default([]),
});
export type IndependentVerification = z.infer<
  typeof IndependentVerificationSchema
>;

export const AuditReportSchema = z.object({
  taskId: z.string(),
  isApproved: z.boolean(),
  verdict: z.enum([
    "APPROVED",
    "REJECTED_LOW_QUALITY",
    "REJECTED_BIAS",
    "REJECTED_MISSING_SOURCES",
  ]),
  rejectionReason: z.string().optional(),
  specificInstructionsForResearcher: z.string().optional(),
  checkedClaims: z.array(z.string()).default([]),
  rejectedClaims: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
  sourceQualityScore: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  utterance: z.string().optional(),
  independentVerification: IndependentVerificationSchema.optional(),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;

// ---------------------------------------------------------------------------
// 5b. Native agent contracts
// ---------------------------------------------------------------------------
export const AgentPersonaIdSchema = z.enum([
  "chief",
  "intelgen",
  "marketing",
  "system",
]);
export type AgentPersonaId = z.infer<typeof AgentPersonaIdSchema>;

export const AgentMessageSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  fromAgent: AgentPersonaIdSchema,
  toAgents: z.array(AgentPersonaIdSchema).default([]),
  sceneId: z.string(),
  content: z.string(),
  basedOn: z.array(z.string()).default([]),
  timestamp: z.string().default(() => new Date().toISOString()),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentDecisionSchema = z.object({
  agentId: AgentPersonaIdSchema,
  decision: z.enum(["approve", "reject", "revise", "continue", "stop"]),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string(),
  nextOwner: AgentPersonaIdSchema.optional(),
  requiredChanges: z.array(z.string()).default([]),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export const RevisionRequestSchema = z.object({
  fromAgent: AgentPersonaIdSchema,
  toAgent: AgentPersonaIdSchema,
  reason: z.string(),
  requiredChanges: z.array(z.string()).default([]),
  attempt: z.number().int().min(1).default(1),
});
export type RevisionRequest = z.infer<typeof RevisionRequestSchema>;

// ---------------------------------------------------------------------------
// 6. Intelligence Final Report (Head of Intel → Chief)
// ---------------------------------------------------------------------------
export const IntelligenceFinalReportSchema = z.object({
  taskId: z.string(),
  status: z.enum(["success", "partial_fail", "failed"]),
  executiveSummary: z.string(),
  keyFacts: z.array(z.string()),
  referenceLinks: z.array(z.string()).default([]),
  mediaAssets: z.array(MediaAssetSchema).default([]),
  tokenUsage: z.number().int().default(0),
  durationSeconds: z.number().default(0),
});
export type IntelligenceFinalReport = z.infer<
  typeof IntelligenceFinalReportSchema
>;

export const IntelligenceBriefSchema = z.object({
  coreAngle: z.string(),
  allowedClaims: z.array(z.string()).default([]),
  bannedClaims: z.array(z.string()).default([]),
  riskFrame: z.string(),
  marketingGuidance: z.string(),
  requiredDisclaimer: z.string().optional(),
});
export type IntelligenceBrief = z.infer<typeof IntelligenceBriefSchema>;

export const IntelDecisionSchema = z.object({
  decision: z.enum([
    "approve_to_marketing",
    "revise_research",
    "stop_low_confidence",
  ]),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string(),
  requiredChanges: z.array(z.string()).default([]),
  utterance: z.string().optional(),
  intelligenceBrief: IntelligenceBriefSchema.optional(),
});
export type IntelDecision = z.infer<typeof IntelDecisionSchema>;

export const IntelHeadNativeOutputSchema = z.object({
  report: IntelligenceFinalReportSchema,
  decision: IntelDecisionSchema,
});
export type IntelHeadNativeOutput = z.infer<typeof IntelHeadNativeOutputSchema>;

// ---------------------------------------------------------------------------
// 7. Content Draft (Content Writer → Head of Marketing)
// ---------------------------------------------------------------------------
export const ContentDraftSchema = z.object({
  taskId: z.string(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  hashtags: z.array(z.string()),
  postFormat: z.enum(["single_post", "carousel", "story"]),
  slideCount: z.number().int().optional(),
  usedMediaAssetIds: z.array(z.string()).default([]),
});
export type ContentDraft = z.infer<typeof ContentDraftSchema>;

// ---------------------------------------------------------------------------
// 8. Marketing Final Report (Head of Marketing → Chief)
// ---------------------------------------------------------------------------
export const MarketingFinalReportSchema = z.object({
  taskId: z.string(),
  status: z.enum([
    "drafted",
    "published",
    "failed_publish",
    "scheduled",
    "pending_approval",
  ]),
  finalCopy: z.string(),
  postFormat: z.string(),
  usedMediaAssetIds: z.array(z.string()).default([]),
  publicationUrl: z.string().optional(),
  scheduledTime: z.string().nullable().optional(),
  errorReason: z.string().optional(),
  tokenUsage: z.number().int().default(0),
});
export type MarketingFinalReport = z.infer<typeof MarketingFinalReportSchema>;

export const MarketingDecisionSchema = z.object({
  decision: z.enum([
    "approve_draft",
    "approve_to_publish",
    "approve_publish_result",
    "revise_caption",
    "stop_not_publishable",
    "stop_publish_failed",
  ]),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string(),
  requiredChanges: z.array(z.string()).default([]),
  utterance: z.string().optional(),
});
export type MarketingDecision = z.infer<typeof MarketingDecisionSchema>;

export const MarketingReviewSchema = z.object({
  positioningScore: z.number().min(0).max(1).default(0.5),
  audienceFitScore: z.number().min(0).max(1).default(0.5),
  hookStrengthScore: z.number().min(0).max(1).default(0.5),
  briefAlignmentScore: z.number().min(0).max(1).default(0.5),
  overallVerdict: z.enum(["strong", "acceptable", "weak", "reject"]),
  improvementNotes: z.array(z.string()).default([]),
  bannedClaimViolations: z.array(z.string()).default([]),
});
export type MarketingReview = z.infer<typeof MarketingReviewSchema>;

// ---------------------------------------------------------------------------
// 9. Cost Entry & Operations Report
// ---------------------------------------------------------------------------
export const CostEntrySchema = z.object({
  taskId: z.string(),
  service: z.string(),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
});
export type CostEntry = z.infer<typeof CostEntrySchema>;

export const OperationsReportSchema = z.object({
  period: z.string(),
  totalTasksRun: z.number().int(),
  totalCostUsd: z.number(),
  mostExpensiveTaskId: z.string().optional(),
  costBreakdown: z.array(CostEntrySchema).default([]),
  failureRatePct: z.number().default(0),
  avgDurationSeconds: z.number().default(0),
});
export type OperationsReport = z.infer<typeof OperationsReportSchema>;

// ---------------------------------------------------------------------------
// 10. Chief Final Decision
// ---------------------------------------------------------------------------
export const ChiefFinalDecisionSchema = z.object({
  final_status: z.enum(["success", "failed", "needs_user_review"]),
  verdict: z.string(),
  reason: z.string(),
  user_facing_summary: z.string(),
  required_follow_up: z.array(z.string()).default([]),
  utterance: z.string(),
});
export type ChiefFinalDecision = z.infer<typeof ChiefFinalDecisionSchema>;

export const ChiefCheckpointSchema = z.object({
  checkpoint: z.enum(["post_intel", "post_marketing_prepublish"]),
  proceed: z.boolean(),
  concern: z.string().nullable().default(null),
  guidance: z.string().nullable().default(null),
  utterance: z.string(),
});
export type ChiefCheckpoint = z.infer<typeof ChiefCheckpointSchema>;

// ---------------------------------------------------------------------------
// 11. Chief Message Request/Response (API contracts)
// ---------------------------------------------------------------------------
export const ChiefMessageMetadataSchema = z.object({
  intentType: z
    .string()
    .describe("Example: 'research_only' or 'full_auto_publish'"),
  topic: z.string().describe("The core topic to research or post about"),
});
export type ChiefMessageMetadata = z.infer<typeof ChiefMessageMetadataSchema>;

export const ChiefMessageResponseSchema = z.object({
  messageText: z.string(),
  options: z.array(z.string()),
  state: z.string(),
  requiresAction: z.boolean().default(false),
  metadata: ChiefMessageMetadataSchema.optional(),
});
export type ChiefMessageResponse = z.infer<typeof ChiefMessageResponseSchema>;

// ---------------------------------------------------------------------------
// 12. Intent types enum
// ---------------------------------------------------------------------------
export const IntentType = z.enum([
  "research_only",
  "research_and_draft_content",
  "full_auto_publish",
  "ask_operations_cost",
  "find_photo_only",
  "continue_from_memory",
  "schedule_content",
  "cancel_task",
]);
export type IntentType = z.infer<typeof IntentType>;

// ---------------------------------------------------------------------------
// 13. Model profile (budget-aware model selection)
// ---------------------------------------------------------------------------
export interface ModelProfile {
  chiefModel: string;
  intelgenModel: string;
  marketingModel: string;
}

export function resolveModelProfile(
  intent: string,
  maxBudgetUsd: number,
): ModelProfile {
  const profile: ModelProfile = {
    chiefModel: "mistral-medium-latest",
    intelgenModel: "mistral-medium-latest",
    marketingModel: "mistral-medium-latest",
  };

  if (maxBudgetUsd <= 0.1) {
    profile.chiefModel = "mistral-small-latest";
    profile.intelgenModel = "mistral-small-latest";
    profile.marketingModel = "mistral-small-latest";
  }

  if (intent === "find_photo_only") {
    profile.intelgenModel = "mistral-small-latest";
  }

  return profile;
}
