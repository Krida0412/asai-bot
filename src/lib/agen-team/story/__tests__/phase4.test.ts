import { describe, expect, it } from "vitest";
import {
  AGENT_PERSONAS,
  getDisplayName,
  getPersonaByBackendRole,
  type AgentPersonaId,
} from "../personas";
import { getAddressName, getRelationshipTone } from "../relationships";

const canonicalIds: AgentPersonaId[] = [
  "chief",
  "intelgen",
  "marketing",
  "system",
];

describe("native 3-agent personas", () => {
  it("exposes only Chief, Intelgen, Marketing, and System personas", () => {
    expect(Object.keys(AGENT_PERSONAS).sort()).toEqual(
      [...canonicalIds].sort(),
    );
  });

  it("maps legacy backend roles into the new runtime agents", () => {
    expect(getPersonaByBackendRole("Chief Agent")).toBe("chief");
    expect(getPersonaByBackendRole("Kepala Intelijen")).toBe("intelgen");
    expect(getPersonaByBackendRole("Research Analyst")).toBe("intelgen");
    expect(getPersonaByBackendRole("QA Auditor")).toBe("intelgen");
    expect(getPersonaByBackendRole("Kepala Marketing")).toBe("marketing");
    expect(getPersonaByBackendRole("Content Writer")).toBe("marketing");
    expect(getPersonaByBackendRole("Social Media Specialist")).toBe(
      "marketing",
    );
    expect(getPersonaByBackendRole("Finance Agent")).toBe("system");
  });

  it("uses product-facing display names for the three agents", () => {
    expect(getDisplayName("chief")).toBe("Pak Arga");
    expect(getDisplayName("intelgen")).toBe("Bu Rani");
    expect(getDisplayName("marketing")).toBe("Pak Bima");
    expect(getDisplayName("system")).toBe("Sistem");
  });

  it("keeps address and relationship helpers on canonical IDs", () => {
    expect(getAddressName("chief", "intelgen")).toBe("Bu Rani");
    expect(getAddressName("chief", "marketing")).toBe("Pak Bima");
    expect(getAddressName("intelgen", "chief")).toBe("Pak Arga");
    expect(getRelationshipTone("chief", "marketing")).toBe("chief_to_agent");
    expect(getRelationshipTone("marketing", "intelgen")).toBe(
      "peer_respectful",
    );
  });
});
