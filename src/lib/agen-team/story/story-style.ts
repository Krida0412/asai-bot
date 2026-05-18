/**
 * Story style engine — deterministic persona-aware text transforms.
 *
 * Does NOT use an LLM. All transforms are rule-based.
 * Cleans backend jargon, applies address names, and adjusts tone
 * based on speaker persona.
 */
import type { AgentPersonaId } from "./personas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StyleContext {
  speakerId: AgentPersonaId;
  targetId?: AgentPersonaId;
  intentType?: string;
  beatId?: string;
  topic?: string;
  roomId?: "war_room" | "intelligence" | "marketing" | "operations";
}

// ---------------------------------------------------------------------------
// Backend jargon patterns to strip
// ---------------------------------------------------------------------------
const JARGON_PATTERNS: [RegExp, string][] = [
  [/\bvia exa\b/gi, ""],
  [/\bexa\b/gi, ""],
  [/\blaporan eksekutif\b/gi, ""],
  [/\briset data selesai\b/gi, ""],
  [/\bmengirim ke auditor\b/gi, ""],
  [/\baudit selesai\b/gi, ""],
  [/\bdata dikembalikan ke chief\b/gi, ""],
  [/\bprogress\b/gi, ""],
  [/\bpipeline\b/gi, ""],
  [/\btool\b/gi, ""],
  [/\bnode\b/gi, ""],
  [/\bgraph\b/gi, ""],
  [/\bexecuteAgentTeam\b/gi, ""],
  [/\bemitter\b/gi, ""],
  [/\bstage\b/gi, ""],
  [/\bwebhook\b/gi, ""],
  [/\binngest\b/gi, ""],
  [/\btoken\b/gi, ""],
  [/\.\.\./g, ""],
];

/**
 * Remove backend/tool jargon from text.
 */
function stripJargon(text: string): string {
  let result = text;
  for (const [pattern, replacement] of JARGON_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * Apply persona-aware style to a base message.
 * Deterministic — no LLM, no randomness.
 *
 * What it does:
 * - Strips backend/tool jargon
 * - Cleans extra whitespace
 *
 * What it intentionally does NOT do:
 * - Rewrite the copy (would be non-deterministic)
 * - Over-personalize (would produce weird output)
 */
export function applyPersonaStyle(
  baseMessage: string,
  _context: StyleContext,
): string {
  if (!baseMessage) return baseMessage;
  return stripJargon(baseMessage);
}

// ---------------------------------------------------------------------------
// Deterministic variant picker
// ---------------------------------------------------------------------------

/**
 * Stable hash for seed strings.
 * Simple but deterministic — same input always picks same variant.
 */
function stableHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Pick a deterministic variant from a list using a stable seed.
 *
 * Seed should be composed of stable identifiers:
 *   `${taskId}:${beatId}`
 *
 * DO NOT use Math.random() — replay must be stable.
 */
export function pickVariant<T>(variants: T[], seed: string): T {
  if (variants.length === 0) {
    throw new Error("pickVariant: variants array cannot be empty");
  }
  if (variants.length === 1) {
    return variants[0];
  }
  const index = stableHash(seed) % variants.length;
  return variants[index];
}
