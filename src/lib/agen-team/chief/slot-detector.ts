/**
 * Chief Chat (Pak Arga) v3 — Slot_Detector
 *
 * `detectSlotsFromFreeText` is the single entry-point used by `Scope_Router`
 * to translate raw user free-text (typed inside Wizard_Card / Confirm_Card_Rich
 * / correction box) into a typed Brief_Ledger slot update.
 *
 * The pipeline is intentionally **layered** so that determinism is preserved
 * (Property 5 in design.md) and so that the LLM never gains authority to
 * decide gate transitions (NFR3):
 *
 *   Layer 1 — keyword whitelist scoped by `marker`
 *     Only the detector(s) relevant to the originating Wizard_Card slot are
 *     run, e.g. `marker = "wizard_format"` only runs the format detector.
 *     Returns `confidence = "high"` on a hit.
 *
 *   Layer 2 — normalize + fuzzy synonym
 *     Lowercases, strips emoji, and applies the {@link SYNONYM_MAP} so that
 *     Bahasa Indonesia variants ("edukatif", "swipe-able", "jualan") collapse
 *     to canonical tokens. Layer 1 detectors are then re-applied; matches
 *     downgrade `confidence` by one notch (high → medium, medium → low).
 *
 *   Layer 3 — optional LLM fallback (`llmExtractor`)
 *     Invoked **only** when (a) `marker` is a `wizard_*` slot marker,
 *     (b) the deterministic layers returned `confidence = "low"`, AND
 *     (c) an `llmExtractor` is provided. The extractor returns JSON `{ value,
 *     confidence }`, never a routing decision. By default no extractor is
 *     wired so this function stays pure-deterministic in tests.
 *
 * The design's high-level contract:
 *
 *   detectSlotsFromFreeText(text, ledger, { marker?, llmExtractor? })
 *     → Promise<{ slot: keyof BriefLedger | null, value, confidence, constraints? }>
 *
 * `constraints` is an optional signal so the caller (Scope_Router) can append
 * cross-cutting modifiers (e.g. "tidak membosankan") detected alongside a
 * `wizard_goal` answer — see Requirement 15.18.
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/design.md "Slot_Detector"
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md
 *      Requirements 3.7, 3.9, 9.6, 15.18, NFR3
 */

import type { Marker } from "./markers";
import type {
  BriefLedger,
  Confidence,
  SupportedFormat,
  SupportedPlatform,
  VisualSource,
} from "./schemas";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of a single slot detection pass. `slot = null` means none of the
 * layered detectors recognised the text — the caller should emit a
 * director_text clarification rather than guessing a default (Requirement 3.9).
 *
 * `constraints` is optional and only populated for `wizard_goal` answers that
 * also mention modifier phrases (e.g. "gak boring" → "tidak membosankan").
 */
export type SlotDetectionResult = {
  slot: keyof BriefLedger | null;
  value: string | null;
  confidence: Confidence;
  /**
   * Extra constraints to append to `ledger.constraints`. Always disjoint from
   * the primary `value`; the caller is expected to merge by union.
   */
  constraints?: string[];
};

/**
 * Pluggable LLM-backed extractor for Layer 3. Implementations MUST only
 * return structured slot data — they MUST NOT issue routing or task-creation
 * decisions (NFR3).
 */
export type LlmSlotExtractor = (args: {
  text: string;
  marker: Marker;
}) => Promise<{ value: string; confidence: Confidence } | null>;

export type DetectSlotsOptions = {
  /** Marker of the originating UI card (Wizard_Card slot, correction box). */
  marker?: Marker;
  /**
   * Optional LLM fallback. When omitted (the default), `detectSlotsFromFreeText`
   * is purely deterministic — useful for unit & property tests.
   */
  llmExtractor?: LlmSlotExtractor;
};

// ---------------------------------------------------------------------------
// Layer 2 — normalization helpers (exported for re-use & tests)
// ---------------------------------------------------------------------------

/**
 * Lowercase, strip pictographic emoji, collapse whitespace. Emoji removal
 * uses `\p{Extended_Pictographic}` so emoji clusters (incl. modifiers like
 * skin-tone) get normalised to a single space.
 */
export function normalizeFreeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\u200d\ufe0f]/g, " ") // ZWJ + variation selector left over
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bahasa Indonesia synonym table. Keys are non-canonical surface forms; the
 * value is the canonical token that the Layer 1 detectors recognise.
 *
 * Frozen so accidental mutation in callers / tests fails fast.
 */
export const SYNONYM_MAP: Readonly<Record<string, string>> = Object.freeze({
  // goal synonyms
  edukatif: "edukasi",
  informatif: "edukasi",
  ngajarin: "edukasi",
  jelasin: "edukasi",
  jualan: "promosi",
  jual: "promosi",
  promo: "promosi",
  "soft selling": "promosi",
  "hard selling": "promosi",
  viral: "engagement",
  interaksi: "engagement",

  // format synonyms
  "swipe-able": "carousel",
  swipeable: "carousel",
  swipe: "carousel",
  karosel: "carousel",
  "single photo": "feed",
  "post foto": "feed",

  // visual source synonyms
  "punya gw": "asset sendiri",
  "punya gua": "asset sendiri",
  "punya gue": "asset sendiri",
  "asset gw": "asset sendiri",
  "aset gw": "asset sendiri",
  "punya sendiri": "asset sendiri",
  "foto sendiri": "asset sendiri",
  "gambar sendiri": "asset sendiri",
  referensi: "internet",
  carikan: "internet",

  // platform synonyms
  ig: "instagram",
  insta: "instagram",
  tweet: "twitter",
});

/**
 * Apply {@link SYNONYM_MAP} as whole-word / whole-phrase substitution.
 * Multi-word keys are matched verbatim (with word boundaries on the outer
 * edges) so "punya gw" → "asset sendiri" works.
 */
export function applySynonyms(normalized: string): string {
  let out = ` ${normalized} `;
  // Iterate longer keys first so multi-word phrases beat single tokens.
  const entries = Object.entries(SYNONYM_MAP).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "gu",
    );
    out = out.replace(re, to);
  }
  return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Constraint detection (used alongside wizard_goal)
// ---------------------------------------------------------------------------

const CONSTRAINT_PATTERNS: ReadonlyArray<{
  match: RegExp;
  constraint: string;
}> = [
  {
    match: /\b(?:tidak|gak|ga|nggak|ngga|anti)\s+boring\b/iu,
    constraint: "tidak membosankan",
  },
  {
    match:
      /\b(?:tidak|gak|ga|nggak|ngga|anti)\s+(?:membosankan|ngebosenin|bosen|bosan)\b/iu,
    constraint: "tidak membosankan",
  },
  {
    match: /\bjangan\s+(?:hard\s*selling|hardsell|jualan\s+banget)\b/iu,
    constraint: "hindari hard-selling",
  },
];

/**
 * Detect cross-cutting constraint phrases that should be appended to
 * `ledger.constraints` regardless of the primary slot value.
 */
export function detectConstraints(text: string): string[] {
  const out: string[] = [];
  for (const { match, constraint } of CONSTRAINT_PATTERNS) {
    if (match.test(text) && !out.includes(constraint)) out.push(constraint);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layer 1 — keyword whitelists (exported for re-use & tests)
// ---------------------------------------------------------------------------

export const PLATFORM_KEYWORDS: ReadonlyArray<{
  match: RegExp;
  value: SupportedPlatform;
}> = [
  { match: /\b(?:instagram|insta|ig)\b/iu, value: "instagram" },
  { match: /\b(?:twitter|tweet|x)\b/iu, value: "twitter" },
];

export const FORMAT_KEYWORDS: ReadonlyArray<{
  match: RegExp;
  value: SupportedFormat;
}> = [
  // Carousel takes priority — "feed/carousel" should resolve to carousel.
  {
    match: /\b(?:carousel|carousel\s+photo|karosel|swipe|swipe[- ]?able)\b/iu,
    value: "instagram_carousel_photo",
  },
  {
    match:
      /\b(?:feed|single\s+photo|post\s+foto|feed\s+foto|foto\s+caption|caption\s+foto|feed\s+photo|photo\s+caption)\b/iu,
    value: "instagram_feed_photo_caption",
  },
];

export const GOAL_KEYWORDS: ReadonlyArray<{
  match: RegExp;
  value: string;
}> = [
  {
    match: /\b(?:edukasi|edukatif|informatif|ngajarin|jelasin)\b/iu,
    value: "edukasi",
  },
  {
    match:
      /\b(?:promosi|promo|jualan|jual|soft[- ]?selling|hard[- ]?selling)\b/iu,
    value: "promosi",
  },
  {
    match: /\b(?:engagement|viral|interaksi|polling|tanya\s+jawab)\b/iu,
    value: "engagement",
  },
];

export const VISUAL_KEYWORDS: ReadonlyArray<{
  match: RegExp;
  value: VisualSource;
}> = [
  {
    match:
      /\b(?:internet|referensi|carikan(?:\s+gambar)?|cari(?:\s+gambar)?|gambar\s+dari\s+internet)\b/iu,
    value: "internet_reference",
  },
  {
    match:
      /\b(?:asset\s+sendiri|aset\s+sendiri|punya\s+gw|punya\s+gua|punya\s+gue|asset\s+gw|aset\s+gw|punya\s+sendiri|foto\s+sendiri|gambar\s+sendiri)\b/iu,
    value: "user_owned_asset",
  },
];

// ---------------------------------------------------------------------------
// Per-slot detector implementations (Layer 1)
// ---------------------------------------------------------------------------

type SlotDetector = (text: string) => SlotDetectionResult | null;

const detectPlatformSlot: SlotDetector = (text) => {
  for (const { match, value } of PLATFORM_KEYWORDS) {
    if (match.test(text)) {
      return { slot: "platform", value, confidence: "high" };
    }
  }
  return null;
};

const detectFormatSlot: SlotDetector = (text) => {
  for (const { match, value } of FORMAT_KEYWORDS) {
    if (match.test(text)) {
      return { slot: "format", value, confidence: "high" };
    }
  }
  return null;
};

const detectGoalSlot: SlotDetector = (text) => {
  for (const { match, value } of GOAL_KEYWORDS) {
    if (match.test(text)) {
      return { slot: "goal", value, confidence: "high" };
    }
  }
  return null;
};

const detectVisualSlot: SlotDetector = (text) => {
  for (const { match, value } of VISUAL_KEYWORDS) {
    if (match.test(text)) {
      return { slot: "visualSource", value, confidence: "high" };
    }
  }
  return null;
};

/**
 * Topic detection — extracts the noun phrase after `tentang|soal|mengenai|...`
 * if present, otherwise falls back to the whole text when it is short and
 * contains at least one letter. Always returns `topicCandidate` (never
 * `confirmedTopic`) — Requirement 10.1 reserves promotion to `confirmedTopic`
 * for the Scope_Router after detecting an explicit imperative.
 */
const detectTopicSlot: SlotDetector = (text) => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const explicit = trimmed.match(
    /\b(?:tentang|soal|mengenai|seputar|tema|topik)\s+(.+)$/iu,
  );
  if (explicit?.[1]) {
    const value = explicit[1]
      .trim()
      .replace(/[.!?]+$/g, "")
      .trim();
    if (value.length >= 3) {
      return { slot: "topicCandidate", value, confidence: "high" };
    }
  }

  if (trimmed.length <= 80 && /\p{L}/u.test(trimmed)) {
    return { slot: "topicCandidate", value: trimmed, confidence: "medium" };
  }
  return null;
};

/**
 * Pick the detector list for a given marker. Wizard_* markers narrow the
 * search to one slot so e.g. answering "twitter" inside a `wizard_goal` card
 * doesn't accidentally rewrite the platform.
 *
 * For non-wizard markers (correction, advisory_*, none) we fall back to a
 * priority-ordered scan of every detector — the more specific platform /
 * format / visual / goal detectors run first and topic detection is last
 * because it is the most permissive.
 */
function detectorsForMarker(
  marker: Marker | undefined,
): readonly SlotDetector[] {
  switch (marker) {
    case "wizard_platform":
      return [detectPlatformSlot];
    case "wizard_format":
      return [detectFormatSlot];
    case "wizard_topic":
      return [detectTopicSlot];
    case "wizard_goal":
      return [detectGoalSlot];
    case "wizard_visual":
      return [detectVisualSlot];
    default:
      return [
        detectPlatformSlot,
        detectFormatSlot,
        detectVisualSlot,
        detectGoalSlot,
        detectTopicSlot,
      ];
  }
}

function slotForMarker(marker: Marker): keyof BriefLedger | null {
  switch (marker) {
    case "wizard_platform":
      return "platform";
    case "wizard_format":
      return "format";
    case "wizard_topic":
      return "topicCandidate";
    case "wizard_goal":
      return "goal";
    case "wizard_visual":
      return "visualSource";
    default:
      return null;
  }
}

function isWizardSlotMarker(marker: Marker | undefined): boolean {
  return slotForMarker(marker as Marker) !== null;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run Layer 1 (raw) then Layer 2 (normalized + synonyms). Layer 2 hits are
 * downgraded one confidence step relative to Layer 1 so that downstream gate
 * logic can decide whether to bother with the LLM fallback.
 */
function runDeterministicLayers(
  text: string,
  marker: Marker | undefined,
): SlotDetectionResult {
  const detectors = detectorsForMarker(marker);

  // Layer 1: raw text.
  for (const d of detectors) {
    const r = d(text);
    if (r) return r;
  }

  // Layer 2: lowercased, emoji-stripped, synonym-substituted.
  const normalized = applySynonyms(normalizeFreeText(text));
  if (normalized.length === 0) {
    return { slot: null, value: null, confidence: "low" };
  }
  for (const d of detectors) {
    const r = d(normalized);
    if (r) {
      return {
        ...r,
        confidence: r.confidence === "high" ? "medium" : "low",
      };
    }
  }

  return { slot: null, value: null, confidence: "low" };
}

/**
 * Translate user free-text into a Brief_Ledger slot update using a 3-layer
 * pipeline (keyword whitelist → normalize+synonym → optional LLM fallback).
 *
 * The function is **async** so callers can plug in an `llmExtractor`, but the
 * default behaviour (no extractor) is deterministic and sync-equivalent — it
 * returns a resolved promise without performing IO.
 *
 * @param text  Raw user input.
 * @param ledger Current Brief_Ledger (reserved for future ledger-aware
 *               heuristics; presently unused so callers MUST still pass it).
 * @param options.marker        Originating Wizard_Card / correction marker.
 * @param options.llmExtractor  Optional LLM JSON extractor for Layer 3.
 *
 * @see Requirements 3.7 (layered heuristics), 3.9 (clarification on low
 *      confidence), 9.6 (correction handling), 15.18 ("gak boring" → constraint),
 *      NFR3 (LLM has no gate authority).
 */
export async function detectSlotsFromFreeText(
  text: string,
  ledger: BriefLedger,
  options: DetectSlotsOptions = {},
): Promise<SlotDetectionResult> {
  // `ledger` is reserved for future ledger-aware heuristics (e.g. preferring
  // the existing platform when disambiguating a topic). For now the detector
  // is pure on `text`, but we keep the parameter to lock the public contract.
  void ledger;

  if (typeof text !== "string" || text.trim().length === 0) {
    return { slot: null, value: null, confidence: "low" };
  }

  const { marker, llmExtractor } = options;

  const constraints =
    marker === "wizard_goal" ? detectConstraints(text) : [];

  const layered = runDeterministicLayers(text, marker);

  // Layer 3 — LLM fallback. Only fires when:
  //   1. The marker pins a known wizard slot (so the LLM has a concrete
  //      target slot — see slotForMarker).
  //   2. Deterministic layers came back with low confidence.
  //   3. An extractor is wired (kept undefined in tests for determinism).
  if (
    isWizardSlotMarker(marker) &&
    layered.confidence === "low" &&
    llmExtractor
  ) {
    const llm = await llmExtractor({ text, marker: marker as Marker });
    if (llm) {
      const slot = slotForMarker(marker as Marker);
      if (slot) {
        const result: SlotDetectionResult = {
          slot,
          value: llm.value,
          confidence: llm.confidence,
        };
        return constraints.length > 0
          ? { ...result, constraints }
          : result;
      }
    }
  }

  return constraints.length > 0
    ? { ...layered, constraints }
    : layered;
}
