export interface ResearchDynamicData {
  sourceCount?: number;
  sourceNames?: string[];
  keyFindings?: string[];
  topic?: string;
  angle?: string;
  caution?: string;
  agentMessage?: string;
}

export interface QADynamicData {
  checkedClaimsCount?: number;
  riskyClaimsCount?: number;
  riskNotes?: string[];
  approvedSourceCount?: number;
  safetyNote?: string;
  agentMessage?: string;
  independentVerification?: {
    verifiedClaims: string[];
    contradictedClaims: string[];
    verificationSources: string[];
  };
}

export interface IntelSynthesisDynamicData {
  strongestInsights?: string[];
  caveats?: string[];
  agentMessage?: string;
  warRoomReportMessage?: string;
}

export interface WriterDynamicData {
  angle?: string;
  hook?: string;
  captionPreview?: string;
  platform?: string;
  format?: string;
  agentMessage?: string;
}

export interface SocialDynamicData {
  hookFeedback?: string;
  formatFeedback?: string;
  platform?: string;
  publicationResult?: string;
  imageUrl?: string;
  visualSource?: string;
  mediaId?: string;
  error?: string;
  agentMessage?: string;
}

export interface MarketingDynamicData {
  finalAngle?: string;
  finalFormat?: string;
  platform?: string;
  agentMessage?: string;
}

export interface FinalDynamicData {
  marketingHeadMessage?: string;
  chiefMessage?: string;
  resultTitle?: string;
}

export interface StoryDynamicData {
  research?: ResearchDynamicData;
  qa?: QADynamicData;
  intel?: IntelSynthesisDynamicData;
  writer?: WriterDynamicData;
  social?: SocialDynamicData;
  marketing?: MarketingDynamicData;
  final?: FinalDynamicData;
}
