import { z } from "zod";

export const GrowthSprintStatusSchema = z.enum([
  "draft",
  "awaiting_strategy_approval",
  "active",
  "paused",
  "completed",
  "cancelled",
  "failed",
]);
export type GrowthSprintStatus = z.infer<typeof GrowthSprintStatusSchema>;

export const GrowthApprovalPolicySchema = z.enum([
  "strategy_approved_auto_publish",
  "manual_per_post",
  "paused_requires_user_review",
]);
export type GrowthApprovalPolicy = z.infer<typeof GrowthApprovalPolicySchema>;

export const GrowthSprintBriefSchema = z.object({
  accountId: z.string().optional(),
  brandName: z.string().min(1),
  niche: z.string().min(1),
  targetAudience: z.string().min(1),
  targetGoal: z.string().default("Audience Growth"),
  tone: z.string().default("jelas, hangat, dan kredibel"),
  offer: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  postingFrequency: z.string().default("3 posts per week"),
  visualPolicy: z.string().default("Gunakan visual aman dan relevan."),
  forbiddenTopics: z.array(z.string()).default([]),
});
export type GrowthSprintBrief = z.infer<typeof GrowthSprintBriefSchema>;

export const GrowthStrategySchema = z.object({
  positioning: z.string(),
  targetMetric: z.string().default("Audience Growth"),
  weeklyThemes: z.array(z.string()).min(4).max(5),
  contentPillars: z.array(z.string()).min(3).max(6),
  experimentPlan: z.array(z.string()).default([]),
  riskPolicy: z.string(),
  successCriteria: z.array(z.string()).default([]),
  chiefVerdict: z.string(),
});
export type GrowthStrategy = z.infer<typeof GrowthStrategySchema>;

export const ContentCalendarItemStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "blocked",
  "needs_user_approval",
  "failed",
]);
export type ContentCalendarItemStatus = z.infer<
  typeof ContentCalendarItemStatusSchema
>;

export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ContentCalendarItemSchema = z.object({
  date: z.string().datetime(),
  status: ContentCalendarItemStatusSchema.default("draft"),
  pillar: z.string(),
  objective: z.string(),
  format: z.string().default("feed_photo_caption"),
  brief: z.string(),
  caption: z.string().default(""),
  visualPlan: z.string(),
  publishMode: z
    .enum(["auto_after_strategy_approval", "manual_required"])
    .default("auto_after_strategy_approval"),
  riskLevel: RiskLevelSchema.default("low"),
});
export type ContentCalendarItem = z.infer<typeof ContentCalendarItemSchema>;

export const PerformanceSnapshotSchema = z.object({
  reach: z.number().int().nonnegative().nullable().default(null),
  impressions: z.number().int().nonnegative().nullable().default(null),
  likes: z.number().int().nonnegative().nullable().default(null),
  comments: z.number().int().nonnegative().nullable().default(null),
  shares: z.number().int().nonnegative().nullable().default(null),
  saves: z.number().int().nonnegative().nullable().default(null),
  profileVisits: z.number().int().nonnegative().nullable().default(null),
  followerDelta: z.number().int().nullable().default(null),
  collectedAt: z.string().datetime(),
  source: z.enum(["instagram", "manual", "metrics_unavailable"]),
});
export type PerformanceSnapshot = z.infer<typeof PerformanceSnapshotSchema>;

export const GrowthReviewSchema = z.object({
  whatWorked: z.array(z.string()).default([]),
  whatFailed: z.array(z.string()).default([]),
  audienceSignals: z.array(z.string()).default([]),
  strategyChanges: z.array(z.string()).default([]),
  nextWeekPlan: z.array(z.string()).default([]),
  chiefVerdict: z.string(),
});
export type GrowthReview = z.infer<typeof GrowthReviewSchema>;

export const AgentAgencyDecisionSchema = z.object({
  agentId: z.enum(["chief", "intelgen", "marketing", "system"]),
  decision: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type AgentAgencyDecision = z.infer<typeof AgentAgencyDecisionSchema>;

export const GrowthAgencyPlanSchema = z.object({
  strategy: GrowthStrategySchema,
  calendar: z.array(ContentCalendarItemSchema).min(1),
  experiments: z.array(z.string()).default([]),
  decisions: z.array(AgentAgencyDecisionSchema).default([]),
});
export type GrowthAgencyPlan = z.infer<typeof GrowthAgencyPlanSchema>;

export const CreateGrowthSprintInputSchema = z.object({
  brief: GrowthSprintBriefSchema,
  approvalPolicy: GrowthApprovalPolicySchema.default(
    "strategy_approved_auto_publish",
  ),
});
export type CreateGrowthSprintInput = z.infer<
  typeof CreateGrowthSprintInputSchema
>;
