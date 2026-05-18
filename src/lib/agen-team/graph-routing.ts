import type { AgentDecision, IntelDecision, MarketingDecision } from "./schemas";

export interface NativeChiefRoutingState {
  intent?: string;
  status?: string;
  intelDecision?: Pick<IntelDecision, "decision">;
  marketingDecision?: Pick<MarketingDecision, "decision">;
  agentDecisions?: Array<Pick<AgentDecision, "agentId" | "nextOwner">>;
}

export function routeAfterNativeChief(state: NativeChiefRoutingState) {
  if (state.status === "success" || state.status === "failed") {
    return "end";
  }

  const latestChiefDecision = [...(state.agentDecisions ?? [])]
    .reverse()
    .find((decision) => decision.agentId === "chief");

  if (latestChiefDecision?.nextOwner === "intelgen") {
    return "intelgen";
  }

  if (latestChiefDecision?.nextOwner === "marketing") {
    return "marketing";
  }

  if (!state.intelDecision) {
    return "intelgen";
  }

  if (!state.marketingDecision && state.intent !== "research_only") {
    return "marketing";
  }

  return "end";
}
