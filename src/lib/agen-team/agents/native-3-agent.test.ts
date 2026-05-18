import { describe, expect, it } from "vitest";
import { routeAfterNativeChief } from "../graph-routing";
import { AgentPersonaIdSchema, resolveModelProfile } from "../schemas";

function state(overrides: Record<string, unknown> = {}) {
  return {
    intent: "full_auto_publish",
    status: "running",
    agentDecisions: [],
    ...overrides,
  } as Parameters<typeof routeAfterNativeChief>[0];
}

describe("native 3-agent runtime contracts", () => {
  it("limits runtime persona ids to Chief, Intelgen, Marketing, and System", () => {
    expect(AgentPersonaIdSchema.options).toEqual([
      "chief",
      "intelgen",
      "marketing",
      "system",
    ]);
  });

  it("uses the simplified model profile", () => {
    expect(Object.keys(resolveModelProfile("full_auto_publish", 1)).sort()).toEqual(
      ["chiefModel", "intelgenModel", "marketingModel"],
    );
  });

  it("routes Chief approval to Intelgen first", () => {
    expect(routeAfterNativeChief(state())).toBe("intelgen");
  });

  it("routes Chief Intelgen revision back to Intelgen", () => {
    expect(
      routeAfterNativeChief(
        state({
          intelDecision: { decision: "revise_research" },
          agentDecisions: [
            {
              agentId: "chief",
              nextOwner: "intelgen",
              decision: "revise_research",
            },
          ],
        }),
      ),
    ).toBe("intelgen");
  });

  it("routes approved Intelgen output to Marketing", () => {
    expect(
      routeAfterNativeChief(
        state({
          intelDecision: { decision: "approve_to_marketing" },
          agentDecisions: [
            {
              agentId: "chief",
              nextOwner: "marketing",
              decision: "approve_to_marketing",
            },
          ],
        }),
      ),
    ).toBe("marketing");
  });

  it("routes Chief marketing revision back to Marketing", () => {
    expect(
      routeAfterNativeChief(
        state({
          intelDecision: { decision: "approve_to_marketing" },
          marketingDecision: { decision: "revise_caption" },
          agentDecisions: [
            {
              agentId: "chief",
              nextOwner: "marketing",
              decision: "revise",
            },
          ],
        }),
      ),
    ).toBe("marketing");
  });

  it("ends after final Chief publish verdict", () => {
    expect(
      routeAfterNativeChief(
        state({
          status: "success",
          intelDecision: { decision: "approve_to_marketing" },
          marketingDecision: { decision: "approve_final" },
        }),
      ),
    ).toBe("end");
  });

  it("ends when Chief stops or finalizes", () => {
    expect(routeAfterNativeChief(state({ status: "failed" }))).toBe(
      "end",
    );
    expect(
      routeAfterNativeChief(state({ status: "success" })),
    ).toBe("end");
  });
});
