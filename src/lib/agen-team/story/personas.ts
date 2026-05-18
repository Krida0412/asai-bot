/**
 * Shared persona engine for the native 3-agent Agen Team runtime.
 */

export type AgentPersonaId = "chief" | "intelgen" | "marketing" | "system";

export type AgentLevel = "chief" | "lead" | "system";
export type AgentGender = "male" | "female" | "neutral";
export type AgentDivision = "chief" | "intelligence" | "marketing" | "system";

export interface AgentPersona {
  personaId: AgentPersonaId;
  backendRole: string;
  displayName: string;
  shortName: string;
  title: string;
  level: AgentLevel;
  gender: AgentGender;
  division: AgentDivision;
  speakingStyle: string;
  traits: string[];
}

export const AGENT_PERSONAS: Record<AgentPersonaId, AgentPersona> = {
  chief: {
    personaId: "chief",
    backendRole: "Chief Agent",
    displayName: "Pak Arga",
    shortName: "Pak Arga",
    title: "Chief Agent",
    level: "chief",
    gender: "male",
    division: "chief",
    speakingStyle: "calm, decisive, concise, strategic",
    traits: ["tenang", "tegas", "strategis"],
  },
  intelgen: {
    personaId: "intelgen",
    backendRole: "Intelgen Agent",
    displayName: "Bu Rani",
    shortName: "Bu Rani",
    title: "Intelgen Agent",
    level: "lead",
    gender: "female",
    division: "intelligence",
    speakingStyle: "structured, careful, analytical",
    traits: ["teliti", "skeptis", "berbasis sumber"],
  },
  marketing: {
    personaId: "marketing",
    backendRole: "Marketing Agent",
    displayName: "Pak Bima",
    shortName: "Pak Bima",
    title: "Marketing Agent",
    level: "lead",
    gender: "male",
    division: "marketing",
    speakingStyle: "practical, audience-focused, direct",
    traits: ["praktis", "kreatif", "paham positioning"],
  },
  system: {
    personaId: "system",
    backendRole: "Sistem",
    displayName: "Sistem",
    shortName: "Sistem",
    title: "System",
    level: "system",
    gender: "neutral",
    division: "system",
    speakingStyle: "neutral",
    traits: ["netral"],
  },
};

const ROLE_TO_PERSONA: Record<string, AgentPersonaId> = {
  "Chief Agent": "chief",
  Chief: "chief",
  "Kepala Intelijen": "intelgen",
  "Intelgen Agent": "intelgen",
  "Research Analyst": "intelgen",
  "QA Auditor": "intelgen",
  "Kepala Marketing": "marketing",
  "Marketing Agent": "marketing",
  "Content Writer": "marketing",
  "Social Media Specialist": "marketing",
  "Finance Agent": "system",
  "Operations System": "system",
  Sistem: "system",
};

export function getPersona(personaId: AgentPersonaId): AgentPersona {
  return AGENT_PERSONAS[personaId] ?? AGENT_PERSONAS.system;
}

export function getPersonaByBackendRole(role?: string): AgentPersonaId {
  if (!role) return "system";
  return ROLE_TO_PERSONA[role] ?? "system";
}

export function getDisplayName(personaId: AgentPersonaId): string {
  return getPersona(personaId).displayName;
}

export function getShortName(personaId: AgentPersonaId): string {
  return getPersona(personaId).shortName;
}

export function isHead(personaId: AgentPersonaId): boolean {
  return getPersona(personaId).level === "lead";
}

export function isStaff(_personaId: AgentPersonaId): boolean {
  return false;
}

export function isSystem(personaId: AgentPersonaId): boolean {
  return getPersona(personaId).level === "system";
}
