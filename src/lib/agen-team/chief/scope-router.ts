import { randomUUID } from "node:crypto";
import logger from "logger";
import {
  PendingConfirmationSchema,
  type AdvisoryNote,
  type BriefLedger as SchemaBriefLedger,
  type BriefMaturity as SchemaBriefMaturity,
  type PendingConfirmation as SchemaPendingConfirmation,
  type PendingTaskExecution as SchemaPendingTaskExecution,
} from "@/lib/agen-team/chief/schemas";
import {
  isKnownMarker,
  type Marker,
} from "@/lib/agen-team/chief/markers";

export type AgenTeamScopeClassification =
  | "in_scope_clear"
  | "in_scope_ambiguous"
  | "borderline"
  | "out_of_scope";

export type AskUserInputPayload = {
  type: "single_select" | "multi_select" | "rank_priorities";
  message?: string;
  questions: Array<{
    question: string;
    options: string[];
  }>;
};

/**
 * v3 askUserInput payload — extends {@link AskUserInputPayload} with the
 * marker fields wired through Interactive_Overlay (task 9.1, 10.1):
 *
 * - `kind`: explicit {@link Marker} so `Scope_Router` can dispatch
 *   confirmations / wizard answers / corrections WITHOUT regex-matching
 *   the question text (Requirement 8.1, 8.3, 8.4).
 * - `pendingConfirmationId`: stable `confirmationId` rendered to the UI so
 *   the round-tripped tool answer can be matched to the snapshot
 *   (Requirement 4.6, 7.6).
 * - `allowFreeText` / `freeTextPlaceholder`: enable the free-text input
 *   beside the option buttons (Requirement 3.3, 4.5). Defaults to `true`
 *   for v3 emissions.
 *
 * The legacy {@link AskUserInputPayload} shape is still accepted by the AI
 * SDK tool; v3 emissions add the optional fields without breaking legacy
 * callers (task 9.1 widens the tool inputSchema).
 */
export type AskUserInputPayloadV3 = AskUserInputPayload & {
  kind?: Marker;
  pendingConfirmationId?: string;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
};

export type DirectChiefTaskInput = {
  intentType:
    | "research_only"
    | "research_and_draft_content"
    | "full_auto_publish"
    | "schedule_content"
    | "find_photo_only";
  topic: string;
  brief: string;
  maxSources?: number;
  needsPhoto?: boolean;
  platform?: string;
  outputFormat?: string;
  requirements?: string[];
};

export type SupportedPlatform = "instagram" | "twitter";

export type SupportedFormat =
  | "instagram_feed_photo_caption"
  | "instagram_carousel_photo"
  | "instagram_carousel"
  | "instagram_reels_script"
  | "instagram_story_caption"
  | "twitter_single_post"
  | "twitter_thread"
  | "twitter_engagement_launch";

export type VisualSource = "internet_reference" | "user_owned_asset";

/**
 * Brief maturity level 0..5 — gate utama keputusan Scope_Router v3.
 *
 * Re-export dari `@/lib/agen-team/chief/schemas` untuk menjaga single source
 * of truth. Level 5 ditambah di v3 (sebelumnya 0..4) untuk mendukung jalur
 * `pendingTaskExecution.enqueued` (Requirement 2.7).
 */
export type BriefMaturity = SchemaBriefMaturity;

/**
 * Snapshot brief untuk Confirm_Card_Rich. Re-export dari schemas v3 yang
 * memiliki kontrak auto-publish default (`intentType: "full_auto_publish"`,
 * `output: "publish_to_instagram"`, `publish: true`) plus `confirmationId`,
 * `taskInput`, `createdAt`, `audience`. Tasks 5.3/5.5 akan mem-build snapshot
 * ini saat masuk Level 3; tugas 3.1 hanya stub ke `null`.
 *
 * @see Requirement 1.7, 7.1, 7.2
 */
export type PendingConfirmation = SchemaPendingConfirmation;

/**
 * Brief Ledger v3 — single source of truth state per-thread untuk Scope_Router.
 * Re-export dari schemas agar payload yang divalidasi `zod` selaras dengan
 * tipe TypeScript yang dipakai di state machine.
 *
 * Catatan migrasi v2 → v3:
 * - Field `unsupportedFormat` v2 dihapus (Requirement 1.10). Logika format
 *   yang tidak didukung dipindah ke advisory notes + director_text (task 6.3).
 * - `format` enum hanya menerima `instagram_feed_photo_caption` /
 *   `instagram_carousel_photo`. Format legacy (Reels, Story, Twitter) tidak
 *   lagi disimpan ke ledger (di-strip oleh `toLedgerFormat`).
 * - `pendingConfirmation` di-narrow ke kontrak auto-publish default; v3
 *   menyimpan `confirmationId`, `taskInput`, `createdAt`, dst. (snapshot logic
 *   ada di task 5.5; di task 3.1 selalu di-stub ke `null`).
 * - `pendingTaskExecution: PendingTaskExecution | null` dan
 *   `advisoryNotes: AdvisoryNote[]` adalah field baru.
 */
export type BriefLedger = SchemaBriefLedger;

export type IntakePhase =
  | "idle"
  | "understanding_intent"
  | "gathering_context"
  | "seasoning_brief"
  | "awaiting_confirmation"
  | "confirmed"
  | "cancelled"
  | "publish_gate";

export type ChiefMessageLike = {
  role?: string;
  parts?: unknown[];
};

export type ChiefIntakeState = {
  phase: IntakePhase;
  ledger: BriefLedger;
  platform?: SupportedPlatform;
  format?: SupportedFormat;
  topic?: string;
  topicCategory?: "promotion" | "education" | "idea" | "unknown";
  visualSource?: VisualSource;
  /**
   * Backward-compatible top-level aliases for existing tests/callers.
   * Canonical values live in ledger, but keeping these fields prevents older
   * unit tests and integrations from breaking while Agentic Chief v3 uses the
   * ledger internally.
   */
  goal?: string | null;
  workflowPreference?: string | null;
  constraints: string[];
  needsVisualSource: boolean;
  readyForConfirmation: boolean;
  hasPendingConfirmation: boolean;
  correctionRequested: boolean;
  cancelled: boolean;
  confirmed: boolean;
  unsupportedPlatform?: string;
  lastUserText: string;
  lastSignalText: string;
  lastSignalKind: "user_text" | "tool_answer" | "none";
  hasContentIntent: boolean;
  briefMaturity: BriefMaturity;
  /**
   * Transient (per-request) handle to the `confirmationId` that was just
   * displaced by a correction (Requirement 9.4d, 9.5).
   *
   * Set by `applySignal` when the user clicks "Ubah dulu" (marker
   * `"correction"`) OR types a free-text correction while a
   * Confirm_Card_Rich is active. Captures the old
   * `pendingConfirmation.confirmationId` BEFORE wiping
   * `state.ledger.pendingConfirmation`, so the chief-chat endpoint
   * (task 8.1) can call `markConfirmationCancelled(replacedConfirmationId)`
   * on the legacy idempotency row BEFORE emitting the new card with the
   * fresh `c_new` (Requirement 9.4d, 9.5).
   *
   * NOT persisted on `BriefLedger` — it is a one-shot signal consumed by
   * the endpoint of the same request and never round-trips through
   * `chief_brief_ledger`.
   */
  replacedConfirmationId?: string;
  /**
   * Transient flag set by `applySignal` when the latest tool answer carries
   * the `"advisory_continue"` marker (Requirement 11.6). When `true`, the
   * maturity-3 path in {@link resolveChiefIntakeDecision} skips the
   * Limitations_Card emission and falls through to Confirm_Card_Rich so the
   * user can continue confirming despite the open advisory note.
   *
   * Reset to `false` at the top of every `applySignal` call so the flag
   * always reflects the LATEST signal — any other marker (or a fresh
   * free-text message) invalidates a previous acknowledgment.
   *
   * NOT persisted on `BriefLedger` — it is a one-shot signal local to a
   * single request, exactly like {@link replacedConfirmationId}.
   *
   * @see Requirement 11.5, 11.6
   */
  advisoryAcknowledged?: boolean;
};

export type ChiefIntakeDecision =
  | {
      type: "ask_user_input";
      payload: AskUserInputPayload;
      assistantText: string;
      state: ChiefIntakeState;
    }
  | { type: "text"; text: string; state: ChiefIntakeState }
  | {
      type: "director_text";
      instruction: string;
      fallbackText: string;
      state: ChiefIntakeState;
    }
  | {
      type: "create_task";
      input: DirectChiefTaskInput;
      assistantText: string;
      state: ChiefIntakeState;
    }
  | {
      type: "publish_gate";
      provider: "instagram" | "twitter" | "unknown";
      text: string;
      state: ChiefIntakeState;
    }
  | {
      type: "open_cancellation_window";
      confirmationId: string;
      scheduledExecuteAt: string;
      state: ChiefIntakeState;
    }
  | {
      type: "cancel_window_acknowledged";
      confirmationId: string;
      state: ChiefIntakeState;
    }
  | {
      type: "ready_for_story";
      taskId: string;
      state: ChiefIntakeState;
    }
  | {
      type: "task_failed";
      confirmationId: string;
      failureStatus: "error" | "rate_limited";
      failureMessage: string | null;
      state: ChiefIntakeState;
    };

/**
 * v3 IntakeDecision — the tight union returned by
 * `resolveChiefIntakeDecision` after task 3.2.
 *
 * Per design.md "API publik yang baru / berubah", the gating switch only
 * emits these variants. Legacy variants (`text`, `create_task`,
 * `publish_gate`) are no longer produced by Scope_Router; they remain on
 * {@link ChiefIntakeDecision} as a wider compat alias purely so existing
 * tests and the chief-chat route keep type-checking until task 8.1 cleans
 * the consumer up.
 *
 * The payload variants map to the maturity table in design.md
 * "Property 1: Gate semantics ditentukan sepenuhnya oleh briefMaturity":
 *
 * - 0..1 → `director_text` (natural follow-up).
 * - 2    → `ask_user_input` with `kind = "wizard_<slot>"`.
 * - 3    → `ask_user_input` with `kind = "confirm_brief"`.
 * - 4    → `open_cancellation_window` (or `cancel_window_acknowledged` after
 *           the user cancels the running window).
 * - 5    → `ready_for_story`.
 *
 * Side-channel:
 * - `task_failed` is emitted whenever `pendingTaskExecution.failureStatus`
 *   is non-null on the persisted ledger (Inngest non-retryable failure or
 *   `rate_limited`, task 8.4 / Requirement 13.6). It is independent of
 *   `briefMaturity` because the failure happens AFTER the chief-chat
 *   request that opened the window has already returned, so the next
 *   request is the first opportunity to surface the failure on the
 *   stream.
 *
 * @see Requirement 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 13.6
 */
export type IntakeDecision =
  | {
      type: "ask_user_input";
      payload: AskUserInputPayloadV3;
      assistantText: string;
      state: ChiefIntakeState;
    }
  | {
      type: "director_text";
      instruction: string;
      fallbackText: string;
      state: ChiefIntakeState;
    }
  | {
      type: "open_cancellation_window";
      confirmationId: string;
      scheduledExecuteAt: string;
      state: ChiefIntakeState;
    }
  | {
      type: "cancel_window_acknowledged";
      confirmationId: string;
      state: ChiefIntakeState;
    }
  | {
      type: "ready_for_story";
      taskId: string;
      state: ChiefIntakeState;
    }
  | {
      type: "task_failed";
      confirmationId: string;
      failureStatus: "error" | "rate_limited";
      failureMessage: string | null;
      state: ChiefIntakeState;
    };

export type { Marker } from "@/lib/agen-team/chief/markers";

/**
 * v3 cancellation window object (re-export from schemas).
 *
 * Task 3.2 mutates this lazily inside `applySignal` when a `confirm_brief`
 * marker arrives so that `determineBriefMaturity` naturally promotes the
 * state from level 3 → 4. Tasks 3.4 / 5.5 will refactor the lifecycle to
 * persist the row before the gate transition runs.
 */
export type PendingTaskExecution = SchemaPendingTaskExecution;

type IntakeSignal = {
  kind: "user_text" | "tool_answer";
  text: string;
  question?: string;
  /**
   * v3 marker dispatch (Requirement 8.1, 8.3, 8.4). When the client emits a
   * tool answer it carries an explicit `kind` (e.g. `"confirm_brief"`,
   * `"correction"`, `"cancel_window"`) plus an optional
   * `pendingConfirmationId` referencing the snapshot. Free-text from the
   * Confirm_Card_Rich/wizard inputs round-trips with the same marker so
   * `Scope_Router` does not need to regex-match question copy.
   *
   * When client emission is not yet wired, both fields stay `undefined`
   * and the router falls back to the v2 button-label heuristics.
   */
  marker?: Marker;
  pendingConfirmationId?: string;
};

const PARTIAL_SLOT_ANSWERS = new Set([
  "instagram",
  "twitter/x",
  "twitter",
  "x",
  "belum yakin",
  "feed foto caption",
  "feed foto + caption",
  "feed foto dan caption",
  "carousel foto",
  "feed/carousel",
  "feed carousel",
  "visual / carousel",
  "visual carousel",
  "reels script",
  "story/caption",
  "story caption",
  "single post",
  "thread",
  "engagement/launch post",
  "engagement launch post",
  "carikan gambar dari internet",
  "saya punya gambar sendiri",
  "produk",
  "edukasi",
  "promosi",
  "cerita brand",
  "engagement",
  "promosi produk/jasa",
  "promosi produk jasa",
  "edukasi/informasi",
  "edukasi informasi",
  "belum punya topik",
  "tulis topik sendiri",
  "sudah punya topik",
  "belum, saya mau koreksi",
  "belum saya mau koreksi",
  "ubah dulu",
  "batal",
  "hanya komentar santai",
  "cuma komentar santai",
  "cari ide konten sejenis",
]);

const CONFIRMATION_ANSWERS = [
  "sudah pas lanjutkan",
  "sudah pas, lanjutkan",
  "sudah pas upload ke instagram",
  "sudah pas, upload ke instagram",
  "upload ke instagram",
  "langsung upload",
  "langsung posting",
  "oke eksekusi",
  "eksekusi",
  "sudah bener lanjutkan",
  "sudah benar lanjutkan",
  "iya lanjut",
  "ya lanjut",
  "benar lanjut",
  "bener lanjut",
  "benar teruskan",
  "bener teruskan",
  "lanjutkan",
  "lanjut",
  "teruskan",
  "oke lanjut",
  "ok lanjut",
];

const OUT_OF_SCOPE_PATTERNS = [
  /\b(coding|kode|ngoding|program|debug|frontend|backend|database|login page|implementasi)\b/i,
  /\b(hukum|legal|kontrak|gugatan|medis|dokter|diagnosa|obat)\b/i,
  /\b(financial planning|rencana keuangan|akuntansi|pajak|rekrut|hrd|hr|lamaran)\b/i,
];

const GENERIC_TOPIC_WORDS = new Set([
  "aku",
  "anda",
  "arah",
  "bahan",
  "bantu",
  "baru",
  "belum",
  "bener",
  "benar",
  "bikin",
  "bingung",
  "buat",
  "caption",
  "carikan",
  "carousel",
  "content",
  "dari",
  "deh",
  "dong",
  "draft",
  "dulu",
  "edukasi",
  "engagement",
  "feed",
  "format",
  "foto",
  "gambar",
  "gua",
  "gue",
  "hasil",
  "ide",
  "ingin",
  "informasi",
  "instagram",
  "internet",
  "jasa",
  "kamu",
  "konten",
  "launch",
  "mau",
  "mulai",
  "opini",
  "pas",
  "pengen",
  "pilih",
  "platform",
  "post",
  "postingan",
  "produk",
  "promosi",
  "reels",
  "saya",
  "script",
  "sendiri",
  "single",
  "story",
  "thread",
  "topik",
  "twitter",
  "untuk",
  "visual",
  "aja",
  "akhirnya",
  "ampun",
  "banget",
  "coba",
  "cukup",
  "dah",
  "doang",
  "emang",
  "entah",
  "gatau",
  "ga",
  "gak",
  "nggak",
  "ngga",
  "nih",
  "sih",
  "sumpah",
  "tuh",
  "ya",
  "yah",
  "yaudah",
  "yaitu",
  "kayaknya",
  "kepikiran",
  "sesuatu",
  "cuma",
  "hanya",
  "kira",
  "kayak",
  "kek",
  "yang",
  "dalam",
  "sebagai",
  "jadikan",
  "jadiin",
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalAnswer(value: string) {
  return normalizeText(value).replace(/[,&]+/g, " ").replace(/\s+/g, " ");
}

function titleCaseTopic(topic: string) {
  const clean = topic.trim().replace(/\s+/g, " ");
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextPart(part: unknown) {
  if (!isRecord(part)) return "";
  if (part.type === "text" && typeof part.text === "string") return part.text;
  return "";
}

function getPartToolName(part: unknown) {
  if (!isRecord(part)) return "";
  if (typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  const invocation = part.toolInvocation;
  if (isRecord(invocation) && typeof invocation.toolName === "string") {
    return invocation.toolName;
  }
  return "";
}

function getPartToolOutput(part: unknown) {
  if (!isRecord(part)) return undefined;
  if ("output" in part) return part.output;
  const invocation = part.toolInvocation;
  if (isRecord(invocation) && "result" in invocation) return invocation.result;
  return undefined;
}

function getPartToolInput(part: unknown) {
  if (!isRecord(part)) return undefined;
  if ("input" in part) return part.input;
  const invocation = part.toolInvocation;
  if (isRecord(invocation) && "args" in invocation) return invocation.args;
  return undefined;
}

function getPartToolState(part: unknown) {
  if (!isRecord(part)) return "";
  return typeof part.state === "string" ? part.state : "";
}

function flattenAnswerValues(
  output: unknown,
): Array<{ question?: string; answer: string }> {
  if (!isRecord(output)) return [];

  const values: Array<{ question?: string; answer: string }> = [];
  for (const [question, rawValue] of Object.entries(output)) {
    if (typeof rawValue === "string") {
      values.push({ question, answer: rawValue });
      continue;
    }
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (typeof item === "string") values.push({ question, answer: item });
      }
    }
  }
  return values;
}

/**
 * Read the v3 marker (`kind`) and `pendingConfirmationId` from a single
 * `askUserInput` tool answer payload (Requirement 8.1, 8.3).
 *
 * The client emits the marker either:
 * - on the tool output object itself (`output.kind`,
 *   `output.pendingConfirmationId`), which is the v3 wire shape that task
 *   10.1 will add to Interactive_Overlay; OR
 * - falls back to inferring the marker from the question text in the tool
 *   *input* (`input.kind`) propagated from `Scope_Router`'s emission. This
 *   keeps marker dispatch working before client emission is wired.
 *
 * Returns `undefined` for both fields when no recognised marker is found,
 * which lets the caller route the answer through the v2 free-text/button
 * label heuristics for a smooth migration.
 */
export function extractToolAnswerMarker(part: unknown): {
  marker?: Marker;
  pendingConfirmationId?: string;
} {
  const result: { marker?: Marker; pendingConfirmationId?: string } = {};

  const output = getPartToolOutput(part);
  if (isRecord(output)) {
    if (typeof output.kind === "string" && isKnownMarker(output.kind)) {
      result.marker = output.kind;
    }
    if (typeof output.pendingConfirmationId === "string") {
      result.pendingConfirmationId = output.pendingConfirmationId;
    }
  }

  if (!result.marker || !result.pendingConfirmationId) {
    const input = getPartToolInput(part);
    if (isRecord(input)) {
      if (
        !result.marker &&
        typeof input.kind === "string" &&
        isKnownMarker(input.kind)
      ) {
        result.marker = input.kind;
      }
      if (
        !result.pendingConfirmationId &&
        typeof input.pendingConfirmationId === "string"
      ) {
        result.pendingConfirmationId = input.pendingConfirmationId;
      }
    }
  }

  return result;
}

export function extractChiefIntakeSignals(messages: ChiefMessageLike[]) {
  const signals: IntakeSignal[] = [];

  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : [];

    if (message.role === "user") {
      const text = parts.map(extractTextPart).filter(Boolean).join(" ").trim();
      if (text) signals.push({ kind: "user_text", text });
    }

    for (const part of parts) {
      const toolName = getPartToolName(part);
      const state = getPartToolState(part);
      if (toolName !== "askUserInput") continue;
      if (state && !state.startsWith("output")) continue;

      const { marker, pendingConfirmationId } = extractToolAnswerMarker(part);

      for (const answer of flattenAnswerValues(getPartToolOutput(part))) {
        signals.push({
          kind: "tool_answer",
          text: answer.answer,
          question: answer.question,
          marker,
          pendingConfirmationId,
        });
      }
    }
  }

  return signals;
}

/**
 * Detect whether an assistant message carries a Confirm_Card_Rich emission.
 *
 * v3 dispatch is **marker-driven**: we read `kind` (and the paired
 * `pendingConfirmationId`) from the `askUserInput` tool input/output via
 * {@link extractToolAnswerMarker}, never regex-match the question copy
 * (Requirement 8.1, 8.3, 8.4). Only `kind === "confirm_brief"` indicates a
 * pending confirmation; any other marker (or none at all) falls through and
 * is treated as a non-confirmation interaction (Requirement 8.5).
 */
function messageHasConfirmationToolInput(message: ChiefMessageLike) {
  const parts = Array.isArray(message.parts) ? message.parts : [];

  for (const part of parts) {
    const toolName = getPartToolName(part);
    if (toolName !== "askUserInput") continue;

    const { marker } = extractToolAnswerMarker(part);
    if (marker === "confirm_brief") return true;
  }

  return false;
}

export function hasPendingConfirmationInHistory(messages: ChiefMessageLike[]) {
  // Any user correction/cancel after the confirmation invalidates it. A confirm
  // answer is still allowed to use the most recent pending confirmation.
  let pending = false;

  for (const message of messages) {
    if (
      message.role === "assistant" &&
      messageHasConfirmationToolInput(message)
    ) {
      pending = true;
    }

    if (message.role === "user") {
      const text = (message.parts ?? [])
        .map(extractTextPart)
        .filter(Boolean)
        .join(" ");
      if (text && (isCorrectionAnswer(text) || isCancelAnswer(text))) {
        pending = false;
      }
    }
  }

  return pending;
}

function getMeaningfulTopicTokens(text: string) {
  return normalizeText(text)
    .replace(/[\/&+-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !GENERIC_TOPIC_WORDS.has(token))
    .filter((token) => token.length >= 3 || /^\d{4}$/.test(token));
}

function cleanupTopicCandidate(text: string) {
  return titleCaseTopic(
    text
      .replace(
        /\b(untuk|buat)\s+(anak muda|audiens|audience|followers?).*$/i,
        "",
      )
      .replace(/\b(bro|banget|deh|dong|aja|nih|sih|ya)$/gi, "")
      .replace(/^(tentang|soal|mengenai|seputar)\s+/i, "")
      .replace(/[.!?]+$/g, "")
      .trim(),
  );
}

export function isIdentityQuestion(text: string) {
  const normalized = normalizeText(text);
  return (
    /\b(siapa|apa ini|pak arga|agen team)\b/i.test(normalized) &&
    /\b(siapa|apa|ini)\b/i.test(normalized)
  );
}

export function isCapabilityQuestion(text: string) {
  const normalized = normalizeText(text);
  return /\b(bisa apa|bisa ngapain|fitur|kemampuan|ngapain aja|apa aja)\b/i.test(
    normalized,
  );
}

export function isPublishRequest(text: string) {
  const normalized = normalizeText(text);
  const hasPublish =
    /\b(postingkan|postkan|postingin|posting|post|publish|publikasi|upload|unggah|tweet|tweeting|kirim)\b/i.test(
      normalized,
    );
  const hasLiveHint =
    /\b(sekarang|langsung|ke instagram|ke ig|ke twitter|ke x|live)\b/i.test(
      normalized,
    );
  return hasPublish && hasLiveHint;
}

export function detectPublishProvider(
  text: string,
): "instagram" | "twitter" | "unknown" {
  const normalized = normalizeText(text);
  if (/\b(instagram|ig|insta)\b/i.test(normalized)) return "instagram";
  if (/\b(twitter|x|tweet)\b/i.test(normalized)) return "twitter";
  return "unknown";
}

export function isUnsupportedPlatformRequest(text: string) {
  const normalized = normalizeText(text);
  return /\b(tiktok|tik tok|linkedin|linked in|blog|artikel|youtube|facebook|threads)\b/i.test(
    normalized,
  );
}

/**
 * Canonical set of unsupported platform keys recognised by Chief v3.
 *
 * Used by {@link detectUnsupportedPlatformName} +
 * {@link getInstagramAdaptationHint} (task 6.6) to drive honest, concrete
 * adaptation hints back to Instagram (Requirement 12.1, 12.2, 12.3). Each
 * key maps to a hint that names a specific Instagram format the user can
 * adapt their idea to.
 */
export type UnsupportedPlatformKey =
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "blog"
  | "threads"
  | "facebook";

/**
 * Detect which unsupported platform the user mentioned, if any.
 *
 * Returns a normalised key (`"tiktok"`, `"youtube"`, ...) so downstream
 * helpers ({@link getInstagramAdaptationHint},
 * {@link directorTextDecisionV3}) can produce a CONCRETE adaptation hint
 * tailored to that platform instead of a generic "platform tidak didukung"
 * line (Requirement 12.3).
 *
 * Returns `null` when no recognised unsupported platform is mentioned.
 *
 * @see Requirement 12.1, 12.3
 */
export function detectUnsupportedPlatformName(
  text: string,
): UnsupportedPlatformKey | null {
  const normalized = normalizeText(text);
  if (/\btik\s?tok\b/i.test(normalized)) return "tiktok";
  if (/\byoutube\b/i.test(normalized)) return "youtube";
  if (/\blinked\s?in\b/i.test(normalized)) return "linkedin";
  if (/\bthreads\b/i.test(normalized)) return "threads";
  if (/\bfacebook\b/i.test(normalized)) return "facebook";
  if (/\b(blog|artikel)\b/i.test(normalized)) return "blog";
  return null;
}

/**
 * Concrete Instagram adaptation hint for an unsupported platform request
 * (Requirement 12.3).
 *
 * Returns a tuple of:
 * - `phrase`: a short natural-language hint mapping the user's request
 *   to an Instagram format, e.g. `"long video TikTok" → "Reels-style
 *   Carousel"`.
 * - `targetFormat`: the suggested Instagram format slot value, used by
 *   the Limitations_Card emission on repeated requests (Requirement 12.5)
 *   so "Ganti pendekatan" can pre-fill the wizard with Chief's
 *   recommendation.
 *
 * The mappings are deterministic and based on the audience expectations
 * for each platform: long-form video platforms map to Reels-style
 * Carousel, professional/long-text platforms map to Carousel education,
 * and short-text platforms map to Feed photo + caption.
 *
 * @see Requirement 12.3, 12.5
 */
export function getInstagramAdaptationHint(platform: UnsupportedPlatformKey): {
  phrase: string;
  targetFormat: SupportedFormat;
} {
  switch (platform) {
    case "tiktok":
      return {
        phrase: '"long video TikTok" → "Reels-style Carousel Instagram"',
        targetFormat: "instagram_carousel_photo",
      };
    case "youtube":
      return {
        phrase:
          '"long video YouTube" → "Carousel Instagram dengan ringkasan poin utama"',
        targetFormat: "instagram_carousel_photo",
      };
    case "linkedin":
      return {
        phrase:
          '"insight LinkedIn" → "Carousel Instagram edukasi"',
        targetFormat: "instagram_carousel_photo",
      };
    case "threads":
      return {
        phrase: '"thread Threads" → "Carousel Instagram"',
        targetFormat: "instagram_carousel_photo",
      };
    case "blog":
      return {
        phrase:
          '"artikel blog" → "Carousel Instagram dengan ringkasan poin utama"',
        targetFormat: "instagram_carousel_photo",
      };
    case "facebook":
      return {
        phrase:
          '"post Facebook" → "Feed foto + caption Instagram"',
        targetFormat: "instagram_feed_photo_caption",
      };
  }
}

/**
 * Human-readable label for an unsupported platform key, used as the lead
 * sentence of the Limitations_Card body on repeated requests
 * (Requirement 12.5).
 */
function formatUnsupportedPlatformLabel(platform: UnsupportedPlatformKey) {
  switch (platform) {
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "linkedin":
      return "LinkedIn";
    case "threads":
      return "Threads";
    case "facebook":
      return "Facebook";
    case "blog":
      return "Blog/artikel";
  }
}

/**
 * Count how many times the user has mentioned an unsupported platform
 * across the message history.
 *
 * Used by the maturity guard in {@link resolveChiefIntakeDecision} to
 * decide whether to emit a director_text (single mention — Requirement
 * 12.5 default) or a Limitations_Card (repeated mentions — Requirement
 * 12.5 escalation). Only `user` role messages with raw text parts are
 * counted; tool answers and assistant messages are ignored so the count
 * reflects user intent, not Chief's own follow-ups.
 *
 * @see Requirement 12.5
 */
function countUnsupportedPlatformMentions(messages: ChiefMessageLike[]) {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts.map(extractTextPart).filter(Boolean).join(" ").trim();
    if (!text) continue;
    if (isUnsupportedPlatformRequest(text)) count += 1;
  }
  return count;
}

export function isOutOfScopeRequest(text: string): boolean {
  const normalized = normalizeText(text);
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isConfirmationAnswer(text: string) {
  const normalized = canonicalAnswer(text);
  return CONFIRMATION_ANSWERS.some((answer) => normalized.includes(answer));
}

export function isCorrectionAnswer(text: string) {
  const normalized = normalizeText(text);
  return (
    /\bbelum\s*,?\s*saya\s+mau\s+koreksi\b/i.test(normalized) ||
    /\b(ubah dulu|koreksi|ubah|ganti|bukan|jangan|salah)\b/i.test(normalized)
  );
}

export function isCancelAnswer(text: string) {
  return /\b(batal|cancel|stop|tidak jadi|ga jadi|nggak jadi)\b/i.test(
    normalizeText(text),
  );
}

export function isPartialSlotAnswer(text: string) {
  const normalized = canonicalAnswer(text);
  return PARTIAL_SLOT_ANSWERS.has(normalized);
}

export function isVagueContentCreationRequest(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (
    !/\b(konten|content|postingan|posting|caption|carousel|reels|feed|story|thread|tweet|sosmed|social media)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (extractExplicitTopic(text)) return false;
  return /\b(pengen|ingin|mau|bantu|tolong|buat|bikin|kepikiran|nyari|cari|yaudah)\b/i.test(
    normalized,
  );
}

function isGenericContentIntentionWithoutTopic(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (extractExplicitTopic(text)) return false;
  const hasCreationIntent =
    /\b(pengen|ingin|mau|bantu|tolong|buat|bikin|nyari|cari|kepikiran|yaudah)\b/i.test(
      normalized,
    );
  const hasContentWord =
    /\b(konten|content|postingan|posting|caption|carousel|reels|feed|story|thread|tweet|sosmed|social media)\b/i.test(
      normalized,
    );
  return hasCreationIntent && hasContentWord;
}

export function hasMeaningfulTopic(text: string) {
  if (!text.trim()) return false;
  if (isPartialSlotAnswer(text)) return false;
  if (isVagueContentCreationRequest(text)) return false;
  if (isGenericContentIntentionWithoutTopic(text)) return false;
  return getMeaningfulTopicTokens(text).length > 0;
}

export function isWorkflowPreferenceWithoutTopic(text: string) {
  const normalized = normalizeText(text);
  if (
    !/\b(riset dulu|research dulu|cari referensi dulu|cari insight dulu)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  const stripped = normalized
    .replace(/\briset dulu baru bikin konten\b/gi, " ")
    .replace(/\briset dulu\b/gi, " ")
    .replace(/\bresearch dulu\b/gi, " ")
    .replace(/\bcari referensi dulu\b/gi, " ")
    .replace(/\bcari insight dulu\b/gi, " ");
  return getMeaningfulTopicTokens(stripped).length === 0;
}

function detectPlatform(text: string): SupportedPlatform | undefined {
  const normalized = normalizeText(text);
  if (/\b(instagram|ig|insta)\b/i.test(normalized)) return "instagram";
  if (/\b(twitter|x|tweet)\b/i.test(normalized)) return "twitter";
  if (/\b(visual\s*\/\s*carousel|visual carousel)\b/i.test(normalized)) {
    return "instagram";
  }
  if (/\b(opini|tulisan pendek)\b/i.test(normalized)) return "twitter";
  return undefined;
}

function detectFormat(
  text: string,
  platform?: SupportedPlatform,
): SupportedFormat | undefined {
  const normalized = normalizeText(text);

  if (
    /\b(feed foto caption|feed foto dan caption|feed foto|foto caption)\b/i.test(
      normalized,
    )
  ) {
    return "instagram_feed_photo_caption";
  }

  if (/\b(carousel foto|karosel foto)\b/i.test(normalized)) {
    return "instagram_carousel_photo";
  }

  if (/\b(feed|caption)\b/i.test(normalized)) {
    return "instagram_feed_photo_caption";
  }

  if (/\b(carousel|karosel)\b/i.test(normalized)) {
    return "instagram_carousel_photo";
  }

  // Legacy values are kept for type/backward compatibility, but the user-facing
  // Instagram upload MVP only offers Feed foto + caption and Carousel foto.
  if (
    /\b(reels|reel|story|thread|single post|tweet|twitter|x)\b/i.test(
      normalized,
    )
  ) {
    return undefined;
  }

  if (
    platform === "instagram" &&
    /\b(visual|gambar|foto)\b/i.test(normalized)
  ) {
    return "instagram_feed_photo_caption";
  }

  return undefined;
}

function detectVisualSource(text: string): VisualSource | undefined {
  const normalized = normalizeText(text);
  if (
    /\b(carikan gambar dari internet|gambar dari internet|internet|cari gambar|carikan foto)\b/i.test(
      normalized,
    )
  ) {
    return "internet_reference";
  }
  if (
    /\b(saya punya gambar sendiri|gambar sendiri|asset sendiri|aset sendiri|foto sendiri|punya foto|punya gambar)\b/i.test(
      normalized,
    )
  ) {
    return "user_owned_asset";
  }
  return undefined;
}

function detectGoal(text: string): string | undefined {
  const normalized = normalizeText(text);
  if (
    /^produk$/i.test(normalized) ||
    /\b(produk|product)\b/i.test(normalized)
  ) {
    return "produk";
  }
  if (
    /^edukasi$/i.test(normalized) ||
    /\b(edukasi|informasi|ngajarin|jelasin)\b/i.test(normalized)
  ) {
    return "edukasi";
  }
  if (
    /^promosi$/i.test(normalized) ||
    /\b(jualan|jual|promosi|promo|soft selling|hard selling)\b/i.test(
      normalized,
    )
  ) {
    return /\b(soft selling|jangan hard selling)\b/i.test(normalized)
      ? "promosi soft-selling"
      : "promosi";
  }
  if (/\b(engagement|interaksi|polling|tanya jawab)\b/i.test(normalized)) {
    return "engagement";
  }
  if (/\b(brand story|cerita brand|personal branding)\b/i.test(normalized)) {
    return "cerita brand";
  }
  if (/\b(awareness)\b/i.test(normalized)) {
    return "awareness";
  }
  return undefined;
}

function detectTopicCategory(
  text: string,
): ChiefIntakeState["topicCategory"] | undefined {
  const normalized = normalizeText(text);
  if (
    /\b(promosi produk|produk jasa|produk\/jasa|jasa|produk)\b/i.test(
      normalized,
    )
  ) {
    return "promotion";
  }
  if (/\b(edukasi|informasi)\b/i.test(normalized)) return "education";
  if (
    /\b(belum punya topik|bantu cari ide|belum tahu topik)\b/i.test(normalized)
  ) {
    return "idea";
  }
  if (/\b(tulis topik sendiri|sudah punya topik)\b/i.test(normalized)) {
    return "unknown";
  }
  return undefined;
}

function extractExplicitTopic(text: string) {
  const normalized = text.trim();
  const patterns = [
    /\b(?:bikin|buat|membuat|post|posting)\s+(?:konten|postingan|post)\s+(.+)$/iu,
    /\b(?:konten|postingan|post)\s+(?:tentang|soal|mengenai|seputar)\s+(.+)$/iu,
    /\b(?:tentang|soal|mengenai|seputar|tema|topik)\s+(.+)$/iu,
    /\b(?:untuk|buat)\s+(?:topik\s+)?(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && hasMeaningfulTopic(candidate)) {
      return cleanupTopicCandidate(candidate);
    }
  }

  return null;
}

/**
 * Classify how aggressively a topic candidate should be promoted into the
 * ledger (Requirement 10.1, 10.2, 10.4):
 *
 * - `"explicit"` — the message is an imperative content command that names a
 *   topic, e.g. `"bikin carousel Instagram tentang skincare remaja"` or
 *   `"posting konten tentang Hari Kartini"`. The user is unambiguously asking
 *   Chief to produce content about that topic, so `confirmedTopic` MUST be
 *   set directly without parking the value in `topicCandidate` first.
 *
 * - `"exploratory"` — the message uses a topic-introducing preposition
 *   (`tentang`, `soal`, `mengenai`, `seputar`) together with an uncertainty
 *   marker (`gatau`, `kepikiran`, `cuma`, `mungkin`, `bingung`, …). The user
 *   is brainstorming aloud rather than ordering content; we ONLY update
 *   `topicCandidate` and the briefMaturity gate stays at level 2 until they
 *   re-affirm via a marker (Requirement 10.1, 10.5).
 *
 * - `"none"` — neither pattern matched. Caller decides the safe default
 *   (currently: candidate-only, never `confirmedTopic`, so an inferred topic
 *   from active brief context cannot accidentally jump straight to level 3).
 *
 * The classifier is deterministic and side-effect free; tuning lives in the
 * regexes and uncertainty word list below.
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 10.1, 10.2, 10.3, 10.4
 */
function classifyTopicIntent(
  text: string,
): "exploratory" | "explicit" | "none" {
  const trimmed = text.trim();
  if (!trimmed) return "none";

  // Imperative content commands: must contain an action verb (bikin/buat/post/
  // posting/publish/upload/unggah) PAIRED with either a content noun
  // (carousel/feed/post/konten/content/reels/story) or a topic-introducing
  // preposition. Either combination expresses an explicit "create content
  // about X" intent (Requirement 10.4).
  const explicitPatterns = [
    /\b(?:bikin|buat|membuat|post|posting|publish|upload|unggah)\s+(?:carousel|feed|post(?:ingan)?|konten|content|reels|story)\b.*?\b(?:tentang|soal|mengenai|seputar)\b/iu,
    /\b(?:post|posting|publish|upload|unggah)\s+(?:konten\s+)?(?:tentang|soal|mengenai|seputar)\b/iu,
  ];
  for (const pattern of explicitPatterns) {
    if (pattern.test(trimmed)) return "explicit";
  }

  // Exploratory: topic-introducing preposition (tentang/soal/mengenai/seputar)
  // co-occurs with an uncertainty/brainstorming marker. The presence of
  // hedging words like "gatau" or "kepikiran" tells us the user is musing
  // rather than ordering, so we only park the candidate (Requirement 10.1).
  const hasTopicPreposition =
    /\b(?:tentang|soal|mengenai|seputar|tema|topik)\b/iu.test(trimmed);
  const hasUncertaintyMarker =
    /\b(?:gatau|gak\s*tau|nggak\s*tau|ga\s*tau|kepikiran|terpikir|terbayang|cuma|hanya|kayaknya|kayanya|mungkin|bingung|sesuatu|entah)\b/iu.test(
      trimmed,
    );
  if (hasTopicPreposition && hasUncertaintyMarker) return "exploratory";

  return "none";
}

function inferTopicFromFreeText(text: string, state: ChiefIntakeState) {
  if (!text.trim()) return undefined;
  if (!hasMeaningfulTopic(text)) return undefined;
  if (isIdentityQuestion(text) || isCapabilityQuestion(text)) return undefined;
  if (isPublishRequest(text) || isUnsupportedPlatformRequest(text))
    return undefined;
  if (isWorkflowPreferenceWithoutTopic(text)) return undefined;
  if (
    isPartialSlotAnswer(text) ||
    isConfirmationAnswer(text) ||
    isCancelAnswer(text)
  ) {
    return undefined;
  }
  if (
    detectPlatform(text) ||
    detectFormat(text, state.platform) ||
    detectVisualSource(text)
  ) {
    // When the message is mostly a preference, do not also turn it into topic.
    const tokens = getMeaningfulTopicTokens(text);
    if (tokens.length <= 1) return undefined;
  }

  // Task 3.8: this guard prevents re-inferring a topic from a goal-only
  // message when we already have one parked. Use the ledger as source of
  // truth (`topicCandidate` OR `confirmedTopic`) instead of the legacy
  // `state.topic` alias, which now mirrors `confirmedTopic` only
  // (Requirement 10.1, 10.5).
  const hasParkedTopic = Boolean(
    state.ledger.topicCandidate ?? state.ledger.confirmedTopic,
  );
  if (
    detectGoal(text) &&
    hasParkedTopic &&
    !/\b(tentang|soal|mengenai|seputar|tema|topik)\b/i.test(text)
  ) {
    return undefined;
  }

  const explicitTopic = extractExplicitTopic(text);
  if (explicitTopic) return explicitTopic;

  const activeBriefContext =
    state.hasContentIntent ||
    Boolean(state.format) ||
    Boolean(state.ledger.goal) ||
    Boolean(state.ledger.workflowPreference) ||
    state.topicCategory === "unknown" ||
    state.topicCategory === "promotion" ||
    state.topicCategory === "education" ||
    state.topicCategory === "idea";

  if (!activeBriefContext) return undefined;

  const tokens = getMeaningfulTopicTokens(text);
  if (tokens.length === 0) return undefined;

  // Keep short concrete phrases like "burger lokal" or "Hari Kartini", but
  // reject long rambles that still sound like meta-conversation.
  if (tokens.length > 8 && !/\b(tentang|soal|mengenai|seputar)\b/i.test(text)) {
    return undefined;
  }

  return cleanupTopicCandidate(text);
}

function isVisualSourceNeeded(state: ChiefIntakeState) {
  return (
    state.platform === "instagram" &&
    (state.format === "instagram_carousel" ||
      state.format === "instagram_story_caption")
  );
}

function emptyLedger(): BriefLedger {
  return {
    constraints: [],
    openQuestions: [],
    confidence: "low",
    briefMaturity: 0,
    pendingConfirmation: null,
    advisoryNotes: [],
    pendingTaskExecution: null,
  };
}

/**
 * Narrow the broader internal `SupportedFormat` (which still keeps legacy
 * Reels/Story/Twitter values for type compatibility with formatOutputFormat)
 * down to the v3 ledger format enum (Requirement 1.4). Legacy formats are
 * dropped from the ledger because the active publish surface only supports
 * Feed foto + caption and Carousel foto.
 */
function toLedgerFormat(
  format?: SupportedFormat,
): "instagram_feed_photo_caption" | "instagram_carousel_photo" | undefined {
  if (
    format === "instagram_feed_photo_caption" ||
    format === "instagram_carousel_photo"
  ) {
    return format;
  }
  return undefined;
}

/**
 * Per-slot merge update of {@link BriefLedger}. For each key in
 * `partial`, the value is written to `state.ledger[key]` ONLY when it is
 * non-null and non-undefined; keys that are absent (or whose value is
 * `null`/`undefined`) preserve the existing slot value verbatim.
 *
 * This is the v3 slot-preservation invariant: any single
 * Slot_Detector / wizard `tool_answer` / correction free-text update must
 * touch only the slots it actually parsed and must NOT clobber sibling
 * slots that the ledger already considers valid. Concretely, answering
 * `wizard_format` with `"carousel"` must keep the existing `topic`,
 * `goal`, `visualSource`, `platform`, etc. intact.
 *
 * The helper also syncs the legacy top-level aliases on
 * {@link ChiefIntakeState} (`platform`, `goal`, `workflowPreference`,
 * `visualSource`, `topic`) so callers that still read those aliases
 * (e.g. `finalizeState`, `buildOpenQuestions`, `formatOutputFormat`) stay
 * consistent with the ledger. The wider `state.format` alias keeps the
 * legacy `SupportedFormat` enum, so callers that need to set it write
 * `state.format` directly alongside their `updateLedger({ format })`
 * call (the ledger field is the narrowed `toLedgerFormat` projection).
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 1.9, 3.8, 9.1, 9.4, 10.3
 */
function updateLedger(
  state: ChiefIntakeState,
  partial: Partial<BriefLedger>,
) {
  if (partial.userIntent !== undefined && partial.userIntent !== null) {
    state.ledger.userIntent = partial.userIntent;
  }
  if (partial.platform !== undefined && partial.platform !== null) {
    state.ledger.platform = partial.platform;
    state.platform = partial.platform;
  }
  if (partial.format !== undefined && partial.format !== null) {
    state.ledger.format = partial.format;
  }
  if (partial.topicCandidate !== undefined && partial.topicCandidate !== null) {
    state.ledger.topicCandidate = partial.topicCandidate;
    // Task 3.8 (Requirement 10.1, 10.5): a `topicCandidate` write MUST NOT
    // touch `state.topic`. The legacy alias mirrors `confirmedTopic` only,
    // so an exploratory utterance that parks a candidate cannot push the
    // gate to level 3 via `readyForConfirmation`.
  }
  if (partial.confirmedTopic !== undefined && partial.confirmedTopic !== null) {
    state.ledger.confirmedTopic = partial.confirmedTopic;
    state.topic = partial.confirmedTopic;
  }
  if (partial.goal !== undefined && partial.goal !== null) {
    state.ledger.goal = partial.goal;
    state.goal = partial.goal;
  }
  if (partial.audience !== undefined && partial.audience !== null) {
    state.ledger.audience = partial.audience;
  }
  if (
    partial.workflowPreference !== undefined &&
    partial.workflowPreference !== null
  ) {
    state.ledger.workflowPreference = partial.workflowPreference;
    state.workflowPreference = partial.workflowPreference;
  }
  if (partial.visualSource !== undefined && partial.visualSource !== null) {
    state.ledger.visualSource = partial.visualSource;
    state.visualSource = partial.visualSource;
  }
  if (partial.constraints !== undefined && partial.constraints !== null) {
    state.ledger.constraints = partial.constraints;
    state.constraints = partial.constraints;
  }
  if (partial.openQuestions !== undefined && partial.openQuestions !== null) {
    state.ledger.openQuestions = partial.openQuestions;
  }
  if (partial.confidence !== undefined && partial.confidence !== null) {
    state.ledger.confidence = partial.confidence;
  }
  if (partial.briefMaturity !== undefined && partial.briefMaturity !== null) {
    state.ledger.briefMaturity = partial.briefMaturity;
  }
  if (partial.advisoryNotes !== undefined && partial.advisoryNotes !== null) {
    state.ledger.advisoryNotes = partial.advisoryNotes;
  }
  // Lifecycle slots (pendingConfirmation, pendingTaskExecution) intentionally
  // accept `null` as a deliberate "clear the snapshot" signal because their
  // mutation is owned by tasks 5.5 / 7.1 with explicit semantics. Until those
  // tasks land, callers still write these directly via `state.ledger.*`; we
  // do not route them through `updateLedger`.
}

function emptyState(): ChiefIntakeState {
  return {
    phase: "idle",
    ledger: { ...emptyLedger(), platform: "instagram" },
    platform: "instagram",
    correctionRequested: false,
    cancelled: false,
    confirmed: false,
    hasPendingConfirmation: false,
    constraints: [],
    needsVisualSource: false,
    readyForConfirmation: false,
    lastUserText: "",
    lastSignalText: "",
    lastSignalKind: "none",
    hasContentIntent: false,
    briefMaturity: 0,
  };
}

/**
 * Narrow reset triggered when the user has already CONFIRMED a brief and then
 * sends a fresh free-text message that is neither a re-confirmation nor a
 * correction (i.e. they are explicitly starting a new content task).
 *
 * Even in this "user moves on" case we honour the slot-preservation invariant
 * (Requirement 1.9, 3.8, 9.1, 9.4, 10.3) by keeping what is safe to reuse:
 *
 * - **Kept**: `platform` (often re-used across tasks for the same user),
 *   `userIntent` (will be re-derived from the next signal), `confidence` reset
 *   to `"low"`, `briefMaturity` reset to `0` (recomputed by `finalizeState`).
 * - **Cleared**: topic / goal / visualSource / format / topicCategory /
 *   constraints / advisoryNotes / pendingConfirmation / pendingTaskExecution,
 *   plus the helper flags (`confirmed`, `correctionRequested`, `cancelled`,
 *   `unsupportedPlatform`, `hasContentIntent`).
 *
 * Per-slot updates that occur OUTSIDE this reset (Slot_Detector, wizard
 * answers, corrections) MUST still go through {@link updateLedger}; the reset
 * is the only place where stale slots are deliberately wiped.
 */
function resetAfterNewUserIntent(state: ChiefIntakeState) {
  const preservedPlatform: SupportedPlatform = state.platform ?? "instagram";
  const preservedUserIntent = state.ledger.userIntent;

  state.platform = preservedPlatform;
  state.format = undefined;
  state.topic = undefined;
  state.topicCategory = undefined;
  state.visualSource = undefined;
  state.goal = undefined;
  state.workflowPreference = undefined;
  state.constraints = [];
  state.ledger = {
    ...emptyLedger(),
    platform: preservedPlatform,
    userIntent: preservedUserIntent,
  };
  state.correctionRequested = false;
  state.cancelled = false;
  state.confirmed = false;
  state.unsupportedPlatform = undefined;
  state.hasContentIntent = false;
}

/**
 * Apply a single intake signal (user free-text or `askUserInput` tool
 * answer) to the in-memory {@link ChiefIntakeState}. v3 dispatch is
 * **marker-driven** (Requirement 8.1, 8.3, 8.4): when a tool answer carries
 * a recognised `marker`, we route on it instead of regex-matching the
 * question copy.
 *
 * Marker dispatch table (mirrors `markers.ts`):
 *
 * | Marker            | Effect on state                                                                                                |
 * | ----------------- | -------------------------------------------------------------------------------------------------------------- |
 * | `confirm_brief`   | Set `confirmed = true`, drop correction flag, lazily arm `pendingTaskExecution`.                               |
 * | `correction`      | Drop `pendingConfirmation` + `pendingTaskExecution`, capture old id into `replacedConfirmationId`, preserve all valid slots, set `correctionRequested`. |
 * | `cancel_brief`    | Set `cancelled = true`, drop `confirmed` (returns immediately).                                                |
 * | `cancel_window`   | Mark `pendingTaskExecution.cancelled = true`, set `cancelled` (returns).                                       |
 * | `wizard_*`        | Slot parsing falls through to the per-slot detectors below.                                                    |
 * | `advisory_continue` | Set transient `advisoryAcknowledged = true`; preserve all slots so the gate re-emits Confirm_Card_Rich.    |
 * | `advisory_change` | Drop the conflicting slot reported by the first advisory note's `suggestion.targetSlot` so maturity falls below 3 → Wizard_Card. |
 *
 * Unknown markers (or `marker === undefined`) fall through to the v2
 * free-text path (Requirement 8.5): the slot detectors run as usual and
 * yes/correction/cancel free-text is interpreted with the same heuristics
 * used for normal user messages, with the extra guard that a yes-equivalent
 * only flips `confirmed = true` when `state.ledger.pendingConfirmation` is
 * non-null (i.e. there is actually a confirmation in flight).
 *
 * Free-text correction guard (Requirement 9.2, 9.3): words like `"bukan"`,
 * `"jangan"`, `"salah"`, `"ubah"`, `"ganti"` are NOT treated as a
 * correction unless an active Confirm_Card_Rich exists on the ledger
 * (`pendingConfirmation !== null`). Outside that context the message
 * flows through the normal Slot_Detector pipeline so the LLM director
 * can re-parse it (Requirement 9.3). When the guard fires inside an
 * active confirmation, the slot updates from the same message ARE applied
 * (so `"ganti jadi promo kopi susu aja"` re-parses goal/topic) and the
 * old confirmation snapshot is dropped, generating a fresh
 * `confirmationId` on the next emission (Requirement 9.4).
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/design.md "Marker yang dikenal"
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 8, 9
 */
function applySignal(
  state: ChiefIntakeState,
  signal: IntakeSignal,
  options?: { now?: Date; newConfirmationId?: () => string },
) {
  const text = signal.text.trim();
  if (!text) return;

  state.lastSignalText = text;
  state.lastSignalKind = signal.kind;
  if (signal.kind === "user_text") state.lastUserText = text;

  // Advisory acknowledgment is a one-shot transient flag (Requirement 11.6):
  // only the LATEST signal decides whether the user is continuing past an
  // open advisory. Clear it on every signal so any later marker (or fresh
  // free-text) invalidates a previous `advisory_continue` click.
  state.advisoryAcknowledged = false;

  if (
    signal.kind === "user_text" &&
    state.confirmed &&
    !isConfirmationAnswer(text) &&
    !isCorrectionAnswer(text)
  ) {
    resetAfterNewUserIntent(state);
    state.lastSignalText = text;
    state.lastSignalKind = signal.kind;
    state.lastUserText = text;
  }

  const normalized = normalizeText(text);

  if (isPublishRequest(text)) {
    updateLedger(state, { userIntent: "publish_request" });
  } else if (isIdentityQuestion(text) || isCapabilityQuestion(text)) {
    updateLedger(state, { userIntent: "question" });
  } else if (
    /\b(konten|postingan|posting|caption|carousel|thread|tweet|reels|story|sosmed|social media)\b/i.test(
      normalized,
    )
  ) {
    state.hasContentIntent = true;
    updateLedger(state, { userIntent: "content_creation_interest" });
  }

  if (isVagueContentCreationRequest(text)) {
    state.hasContentIntent = true;
    updateLedger(state, { userIntent: "content_creation_interest" });
  }

  // v3 marker dispatch (Requirement 8.1, 8.3): cancel_window marks the window
  // cancelled; cancel_brief drops the pending confirmation. Marker has higher
  // priority than free-text fallbacks because it carries explicit intent.
  if (signal.kind === "tool_answer" && signal.marker === "cancel_window") {
    if (state.ledger.pendingTaskExecution) {
      state.ledger.pendingTaskExecution = {
        ...state.ledger.pendingTaskExecution,
        cancelled: true,
        cancelledAt:
          state.ledger.pendingTaskExecution.cancelledAt ??
          (options?.now ?? new Date()).toISOString(),
      };
    }
    state.cancelled = true;
    state.confirmed = false;
    return;
  }

  if (signal.kind === "tool_answer" && signal.marker === "cancel_brief") {
    state.cancelled = true;
    state.confirmed = false;
    return;
  }

  // v3 marker dispatch — advisory_continue / advisory_change
  // (Requirement 11.5, 11.6, 11.7).
  //
  // `advisory_continue` (button "Mengerti, lanjut" on Limitations_Card):
  //   keep every slot intact and set the transient `advisoryAcknowledged`
  //   flag so `resolveChiefIntakeDecision` skips the advisory emission and
  //   re-renders Confirm_Card_Rich. Advisory NEVER blocks confirmation —
  //   the user can confirm despite the open note (Requirement 11.5/11.6).
  //
  // `advisory_change` (button "Ganti pendekatan" on Limitations_Card):
  //   drop the slot value the first advisory note targets so the next
  //   maturity computation falls below 3 and the gate re-emits a
  //   Wizard_Card with Chief's suggested alternatives (Requirement 11.7).
  //   `platform` is never cleared because v3 only supports Instagram
  //   (Requirement 1.3); attempting to "change" the platform would lock
  //   the brief into an unsupported state.
  if (signal.kind === "tool_answer" && signal.marker === "advisory_continue") {
    state.advisoryAcknowledged = true;
    return;
  }

  if (signal.kind === "tool_answer" && signal.marker === "advisory_change") {
    // Re-detect advisory notes from the current ledger snapshot rather than
    // relying on `state.ledger.advisoryNotes`. `applySignal` runs BEFORE
    // `finalizeState` populates `advisoryNotes`, so the persisted hydration
    // path can leave that array empty even when a real conflict exists. The
    // detector is pure (Requirement 11.1, 11.2) so re-running it here yields
    // the same conflict that surfaced the Limitations_Card in the previous
    // turn, letting us look up `suggestion.targetSlot` reliably.
    const note =
      state.ledger.advisoryNotes[0] ?? detectAdvisoryNotes(state.ledger)[0];
    const targetSlot = note?.suggestion?.targetSlot;
    if (targetSlot === "format") {
      state.format = undefined;
      state.ledger.format = undefined;
    } else if (targetSlot === "goal") {
      state.goal = undefined;
      state.ledger.goal = undefined;
    } else if (targetSlot === "visualSource") {
      state.visualSource = undefined;
      state.ledger.visualSource = null;
    }
    // `platform` is intentionally not cleared: v3 only supports Instagram
    // (Requirement 1.3), so changing the platform is not a meaningful
    // outcome of "Ganti pendekatan".
    return;
  }

  if (isCancelAnswer(text)) {
    state.cancelled = true;
    state.confirmed = false;
    return;
  }

  if (signal.kind === "tool_answer" && signal.marker === "correction") {
    // v3 correction marker (Requirement 9.1, 9.4): drop the active
    // pendingConfirmation snapshot + any armed pendingTaskExecution so the
    // gate naturally re-emits a fresh card with a new `confirmationId`.
    // Capture the displaced id on `state.replacedConfirmationId` so the
    // chief-chat endpoint (task 8.1) can mark the old idempotency row
    // `cancelled_at` BEFORE the new card hits the wire (Requirement 9.4d).
    state.correctionRequested = true;
    state.confirmed = false;
    const oldConfirmationId =
      state.ledger.pendingConfirmation?.confirmationId ??
      state.ledger.pendingTaskExecution?.confirmationId ??
      null;
    if (oldConfirmationId) {
      state.replacedConfirmationId = oldConfirmationId;
    }
    state.ledger.pendingConfirmation = null;
    state.ledger.pendingTaskExecution = null;
  } else if (
    isCorrectionAnswer(text) &&
    !isConfirmationAnswer(text) &&
    state.ledger.pendingConfirmation !== null
  ) {
    // v3 free-text correction guard (Requirement 9.2, 9.3, 9.4): trigger the
    // correction path ONLY when an active Confirm_Card_Rich is on the
    // ledger. Outside that context, words like "bukan"/"jangan"/"salah"/
    // "ubah"/"ganti" fall through to the normal slot-detector pipeline so
    // the director can re-parse them — never to over-eager correction.
    state.correctionRequested = true;
    state.confirmed = false;
    const oldConfirmationId =
      state.ledger.pendingConfirmation.confirmationId ??
      state.ledger.pendingTaskExecution?.confirmationId ??
      null;
    if (oldConfirmationId) {
      state.replacedConfirmationId = oldConfirmationId;
    }
    state.ledger.pendingConfirmation = null;
    state.ledger.pendingTaskExecution = null;
  }

  const platform = detectPlatform(text);
  if (platform) {
    updateLedger(state, { platform });
    state.hasContentIntent = true;
  }

  const format = detectFormat(text, state.platform);
  if (format) {
    state.format = format;
    const ledgerFormat = toLedgerFormat(format);
    if (ledgerFormat) {
      updateLedger(state, { format: ledgerFormat });
    }
    state.hasContentIntent = true;
    if (!state.platform) {
      const inferredPlatform: SupportedPlatform = format.startsWith("instagram")
        ? "instagram"
        : "twitter";
      updateLedger(state, { platform: inferredPlatform });
      state.constraints = state.ledger.constraints;
    }
  }

  const visualSource = detectVisualSource(text);
  if (visualSource) {
    updateLedger(state, { visualSource });
  }

  const goal = detectGoal(text);
  if (goal) {
    updateLedger(state, { goal });
    state.hasContentIntent = true;
  }

  if (
    /\b(riset dulu|research dulu|cari referensi dulu|cari insight dulu)\b/i.test(
      normalized,
    )
  ) {
    updateLedger(state, {
      workflowPreference: "riset ringan dulu, lalu draft konten",
    });
    state.hasContentIntent = true;
  }

  const topicCategory = detectTopicCategory(text);
  if (topicCategory) {
    state.topicCategory = topicCategory;
    state.hasContentIntent = true;
  }

  const topic = inferTopicFromFreeText(text, state);
  if (topic) {
    /**
     * Topic-write semantics (Requirement 10.1, 10.2, 10.3, 10.4, 10.5):
     *
     * - Imperative content commands (`classifyTopicIntent === "explicit"`,
     *   e.g. "bikin carousel tentang X", "posting konten tentang X") write
     *   to BOTH `topicCandidate` AND `confirmedTopic` so the gate can
     *   advance to level 3 once the other required slots are filled.
     *
     * - Wizard_Card topic answers (`tool_answer` with `marker ===
     *   "wizard_topic"`) are treated as explicit: the user picked or typed
     *   a topic directly inside the wizard, so we promote straight to
     *   `confirmedTopic` (Requirement 10.2 — wizard re-affirmation is one
     *   of the recognised promotion paths).
     *
     * - Exploratory free-text (`classifyTopicIntent === "exploratory"`,
     *   e.g. "gw kepikiran sesuatu tentang tren skincare deh tapi gatau")
     *   AND ambiguous "none" cases (a topic inferred from active brief
     *   context but without imperative wording) only update
     *   `topicCandidate`. `confirmedTopic` stays whatever it was, so:
     *     • If the slot was empty, level 3 cannot be reached from a
     *       brainstorming utterance alone (Requirement 10.5).
     *     • Slot preservation (task 3.6) keeps an existing
     *       `confirmedTopic` intact when the user later says something
     *       exploratory (Requirement 10.3, 9.1, 9.4).
     *
     * Promotion to `confirmedTopic` from a parked candidate requires either
     * (a) a fresh imperative message, (b) a `wizard_topic` tool answer, or
     * (c) a `confirm_brief` marker on Confirm_Card_Rich (Requirement 10.2).
     */
    const isWizardTopicAnswer =
      signal.kind === "tool_answer" && signal.marker === "wizard_topic";
    const intent = classifyTopicIntent(text);
    if (isWizardTopicAnswer || intent === "explicit") {
      updateLedger(state, { topicCandidate: topic, confirmedTopic: topic });
    } else {
      updateLedger(state, { topicCandidate: topic });
    }
    state.topicCategory = undefined;
    state.hasContentIntent = true;
  }

  if (isUnsupportedPlatformRequest(text) && !platform) {
    state.unsupportedPlatform = text;
  }

  // v3 Requirement 1.10: `unsupportedFormat` field is removed from the ledger.
  // Format-not-supported signals are surfaced via advisory notes + director_text
  // (task 6.3), not via a mute state field.

  // v3 marker dispatch — confirm_brief: arm the cancellation window so
  // determineBriefMaturity naturally promotes state from level 3 → 4
  // (Requirement 2.6, 5.1, 8.1). Tasks 3.4 / 5.5 will refactor the lifecycle
  // to persist the row before the gate transition runs; for now we mutate
  // pendingTaskExecution in-memory here so the maturity computation stays
  // the single source of truth.
  if (signal.kind === "tool_answer" && signal.marker === "confirm_brief") {
    state.confirmed = true;
    state.correctionRequested = false;

    const now = options?.now ?? new Date();
    const generateId = options?.newConfirmationId ?? randomUUID;
    const confirmationId =
      signal.pendingConfirmationId ??
      state.ledger.pendingConfirmation?.confirmationId ??
      generateId();

    if (!state.ledger.pendingTaskExecution) {
      state.ledger.pendingTaskExecution = {
        confirmationId,
        scheduledExecuteAt: new Date(now.getTime() + 30_000).toISOString(),
        cancelled: false,
        cancelledAt: null,
        enqueuedAt: null,
        failureStatus: null,
        failedAt: null,
        failureMessage: null,
      };
    }
  } else if (
    isConfirmationAnswer(text) &&
    signal.kind === "tool_answer" &&
    state.ledger.pendingConfirmation !== null
  ) {
    // v3 fall-through path (Requirement 8.5): when an `askUserInput` tool
    // answer arrives WITHOUT a recognised marker but the user typed a
    // free-text affirmative ("ya lanjut", "oke eksekusi", …), we only
    // accept it as a confirmation if the ledger shows an active
    // `pendingConfirmation` snapshot. This satisfies the marker-driven
    // dispatch contract: unknown markers route through the regular
    // free-text path, but a yes-equivalent only counts when there is
    // actually a confirmation in flight to confirm.
    state.confirmed = true;
    state.correctionRequested = false;
  }
}

/**
 * Detect helper-flag inconsistencies that should collapse `briefMaturity` to 0
 * and force a clarifying director_text path (Requirement 2.9).
 *
 * Examples of inconsistent states we guard against:
 * - `state.confirmed === true` but no `pendingConfirmation` snapshot exists.
 *   v3 only enters confirmed status via the `confirm_brief` marker against an
 *   existing `pendingConfirmation`; missing snapshot means upstream signals
 *   are out of sync.
 * - `pendingTaskExecution !== null` but its `confirmationId` does not match
 *   the `pendingConfirmation.confirmationId` (when both exist). Stale window
 *   row would otherwise let stale `briefMaturity = 4` survive across edits.
 * - `pendingTaskExecution.enqueuedAt !== null` but `cancelled === true` in
 *   the same row. The two bits are mutually exclusive in DB transactions.
 * - `pendingTaskExecution !== null` but its `scheduledExecuteAt` cannot be
 *   parsed as a valid date.
 *
 * The function returns a non-null reason string when the state is inconsistent
 * so the caller can log a warning with structured context.
 */
function detectLedgerInconsistency(state: ChiefIntakeState): string | null {
  const ledger = state.ledger;
  const pendingConfirmation = ledger.pendingConfirmation ?? null;
  const pendingExecution = ledger.pendingTaskExecution ?? null;

  if (state.confirmed && !pendingConfirmation) {
    return "confirmed_without_pending_confirmation";
  }

  if (
    pendingExecution &&
    pendingConfirmation &&
    pendingExecution.confirmationId !== pendingConfirmation.confirmationId
  ) {
    return "pending_execution_id_mismatch";
  }

  if (pendingExecution) {
    if (pendingExecution.cancelled && pendingExecution.enqueuedAt) {
      return "pending_execution_cancelled_and_enqueued";
    }
    const scheduled = Date.parse(pendingExecution.scheduledExecuteAt);
    if (Number.isNaN(scheduled)) {
      return "pending_execution_invalid_schedule";
    }
  }

  return null;
}

/**
 * Compute `briefMaturity` 0..5 deterministically from the ledger snapshot,
 * helper flags, and the current time. The mapping mirrors the table in
 * `design.md` "Definisi level briefMaturity" and stays the single source of
 * gating semantics for `resolveChiefIntakeDecision` (task 3.2).
 *
 * Helper flags such as `readyForConfirmation`, `confirmed`, `cancelled`, and
 * `correctionRequested` are still computed by `finalizeState` so existing
 * legacy callers and the mid-level decision routing keep working, but they are
 * **inputs** to maturity, not the gating switch (Requirement 2.8).
 *
 * Level transitions (Requirement 2.1 .. 2.7):
 *   - 5: `pendingTaskExecution.enqueuedAt` is non-null. Task is in pipeline.
 *   - 4: cancellation window is armed (not cancelled, not yet enqueued, and
 *        `scheduledExecuteAt` is still in the future relative to `now`).
 *   - 3: all required slots are valid AND `pendingConfirmation` snapshot
 *        exists (with `confirmationId`). Confirm_Card_Rich is renderable.
 *   - 2: `topicCandidate` exists but at least one required slot
 *        (`goal` or `visualSource`) is still missing.
 *   - 1: user shows `content_creation_interest` and a single preference
 *        (`platform` or `format`) is filled but no topicCandidate yet.
 *   - 0: default (vague intent, casual chat, identity/capability question,
 *        out-of-scope, or detected state inconsistency per Requirement 2.9).
 *
 * @param state - Reconstructed intake state with helper flags populated.
 * @param now - Current time, injected for testability and determinism.
 */
function determineBriefMaturity(
  state: ChiefIntakeState,
  now: Date,
): BriefMaturity {
  const ledger = state.ledger;
  const pendingExecution = ledger.pendingTaskExecution ?? null;

  // Requirement 2.9: collapse to 0 on inconsistent state.
  const inconsistency = detectLedgerInconsistency(state);
  if (inconsistency) {
    logger.warn(
      "[chief.scope-router] briefMaturity forced to 0 due to inconsistent state",
      { reason: inconsistency },
    );
    return 0;
  }

  // Level 5: task already enqueued (Requirement 2.7).
  if (pendingExecution && pendingExecution.enqueuedAt !== null) {
    return 5;
  }

  // Level 4: cancellation window armed (Requirement 2.6).
  if (
    pendingExecution &&
    pendingExecution.cancelled === false &&
    pendingExecution.enqueuedAt === null
  ) {
    const scheduled = new Date(pendingExecution.scheduledExecuteAt);
    if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() > now.getTime()) {
      return 4;
    }
  }

  // Level 3: all required slots valid (Requirement 2.5). Per design.md
  // "Definisi level briefMaturity" the level 3 transition snapshots a fresh
  // `pendingConfirmation` with a new `confirmationId`; that snapshot building
  // is owned by tasks 5.3 / 5.5 and may not be present in-memory yet.
  // Task 3.2 therefore promotes to level 3 as soon as required slots are
  // valid so the gate switch can emit a Confirm_Card_Rich payload (with a
  // freshly generated `pendingConfirmationId`). When task 5.5 lands, the
  // snapshot will be persisted before this point and the check will become a
  // strict equality on the snapshot row.
  const allRequiredSlotsValid = Boolean(
    ledger.platform &&
      ledger.format &&
      ledger.confirmedTopic &&
      ledger.goal &&
      ledger.visualSource,
  );
  if (allRequiredSlotsValid) {
    return 3;
  }

  // Level 2: topicCandidate present but at least one required slot missing
  // (Requirement 2.4).
  const hasTopicCandidate = Boolean(
    ledger.topicCandidate ?? ledger.confirmedTopic,
  );
  if (
    hasTopicCandidate &&
    (!ledger.goal || !ledger.visualSource || !ledger.format || !ledger.platform)
  ) {
    return 2;
  }

  // Level 1: content_creation_interest with at least one preference, no topic
  // (Requirement 2.3).
  const hasContentInterest =
    ledger.userIntent === "content_creation_interest" ||
    state.hasContentIntent;
  const hasPreference = Boolean(ledger.platform || ledger.format);
  if (hasContentInterest && hasPreference && !hasTopicCandidate) {
    return 1;
  }

  // Level 0: default (Requirement 2.2, 2.9).
  return 0;
}

function buildOpenQuestions(state: ChiefIntakeState) {
  const questions: string[] = [];
  if (!state.topic) questions.push("topik/bahan utama");
  if (!state.format) questions.push("format upload Instagram");
  if (state.topic && !state.ledger.goal) questions.push("tujuan/angle konten");
  if (state.needsVisualSource && !state.visualSource)
    questions.push("sumber visual");
  return questions;
}

/**
 * Detect whether a topic string carries real-time / time-sensitive value
 * (breaking news, live updates, match scores, …).
 *
 * Used by {@link detectAdvisoryNotes} (Requirement 11.2) to flag a
 * platform-topic mismatch when the active platform is Instagram. Instagram
 * feeds are not real-time channels, so Chief should suggest adapting the
 * topic to a recap / explainer / commentary format.
 *
 * Returns `false` for empty / null / undefined input so callers can pass
 * `confirmedTopic ?? topicCandidate ?? null` directly.
 */
function isRealtimeTopic(topic: string | null | undefined): boolean {
  if (!topic) return false;
  const normalized = topic.toLowerCase();
  return /\b(breaking news|berita\s+terkini|berita\s+breaking|live\s+(?:match|update|score|blog)|real[- ]?time|match\s+score|live\s+blog|skor\s+live|update\s+live)\b/.test(
    normalized,
  );
}

/**
 * Detect cross-slot conflicts in the current ledger and return a list of
 * advisory notes that Chief should surface to the user (Requirement 11.1,
 * 11.2, 11.8). Pure function — does NOT mutate the ledger; the caller
 * (`finalizeState`) owns the merge.
 *
 * Detection rules:
 * - **Goal–Format conflict** (Requirement 11.1): when `goal === "engagement"`
 *   AND `format === "instagram_feed_photo_caption"`, suggest switching to
 *   `instagram_carousel_photo` because carousels typically drive higher
 *   engagement than single feed photos.
 * - **Platform–Topic mismatch** (Requirement 11.2): when the active topic
 *   (`confirmedTopic` first, falling back to `topicCandidate`) is a
 *   real-time / breaking news topic and the platform is Instagram (the only
 *   active platform in v3), suggest adapting the angle to a recap /
 *   explainer carousel so relevance survives beyond the live moment.
 *
 * Re-detection on every finalize ensures stale advisories are dropped when
 * slots change (e.g. user switches goal away from `"engagement"`).
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 11.1, 11.2, 11.8
 */
export function detectAdvisoryNotes(ledger: BriefLedger): AdvisoryNote[] {
  const notes: AdvisoryNote[] = [];

  // Requirement 11.1 — Goal vs Format conflict.
  if (
    ledger.goal === "engagement" &&
    ledger.format === "instagram_feed_photo_caption"
  ) {
    notes.push({
      id: "goal-format-engagement-feed",
      kind: "goal_format_conflict",
      title: "Carousel mungkin lebih cocok untuk engagement",
      body: "Goal kamu engagement, tapi format yang dipilih Feed foto. Carousel cenderung memicu interaksi lebih tinggi karena audiens swipe-through. Mau coba ganti ke Carousel foto?",
      suggestion: {
        targetSlot: "format",
        suggestedValue: "instagram_carousel_photo",
        reasoning:
          "Carousel rata-rata mendapat engagement rate lebih tinggi daripada single feed photo untuk konten edukatif/storytelling.",
      },
    });
  }

  // Requirement 11.2 — Platform vs Topic mismatch (real-time topic on
  // Instagram). Read confirmedTopic first, then topicCandidate, so the
  // advisory fires as soon as the topic enters the ledger even if it is
  // still parked as a candidate.
  const activeTopic = ledger.confirmedTopic ?? ledger.topicCandidate ?? null;
  if (
    isRealtimeTopic(activeTopic) &&
    (ledger.platform === undefined || ledger.platform === "instagram")
  ) {
    notes.push({
      id: "platform-topic-realtime-instagram",
      kind: "platform_topic_mismatch",
      title: "Topik real-time biasanya kurang ideal di Instagram",
      body: "Topik kamu cenderung punya nilai waktu (breaking news / live update). Instagram bukan platform real-time terbaik. Bisa adaptasi jadi recap, infographic, atau commentary yang masih relevan beberapa jam-hari setelahnya.",
      suggestion: {
        targetSlot: "format",
        suggestedValue: "instagram_carousel_photo",
        reasoning:
          "Format carousel cocok untuk recap/explainer breaking news, sehingga relevansi tetap terjaga walau bukan real-time.",
      },
    });
  }

  return notes;
}

/**
 * Finalize the in-memory intake state by computing helper flags
 * (`readyForConfirmation`, `hasPendingConfirmation`, etc.), syncing the ledger
 * snapshot, and computing `briefMaturity` 0..5 deterministically.
 *
 * Helper flags are still computed because legacy mid-level routing in
 * `resolveChiefIntakeDecision` (task 3.2 will refactor this) and existing
 * tests rely on them. They are inputs to maturity, **not** the primary gating
 * switch (Requirement 2.8). The maturity level is the canonical decision key.
 *
 * Notes about v3 schema migration (task 3.1 scope):
 * - `pendingConfirmation` is always set to `null` here. Tasks 5.3 / 5.5 will
 *   build the real snapshot with `confirmationId`, `taskInput`, `createdAt`,
 *   etc. Until then, level 3 cannot be reached purely from in-memory signals
 *   (callers building snapshots in DB will populate it).
 * - `pendingTaskExecution` is preserved across calls (loaded from persisted
 *   ledger by upstream `reconstructChiefIntakeState`). This function does not
 *   create or mutate it; tasks 5.5 / 7.1 own that lifecycle.
 *
 * @param state - Mutable state being finalized.
 * @param messages - Full message history for confirmation tool detection.
 * @param now - Current time (defaults to `new Date()` for backward compat).
 */
function finalizeState(
  state: ChiefIntakeState,
  messages: ChiefMessageLike[],
  now: Date = new Date(),
) {
  // Helper flags (inputs to maturity, not the gating switch — Requirement 2.8).
  state.hasPendingConfirmation = hasPendingConfirmationInHistory(messages);
  state.needsVisualSource = isVisualSourceNeeded(state);
  state.readyForConfirmation = Boolean(
    state.topic &&
      state.ledger.goal &&
      state.format &&
      (!state.needsVisualSource || state.visualSource),
  );

  // Sync legacy top-level aliases back into the ledger so the ledger remains
  // the single source of truth for downstream gating (Requirement 1.8).
  state.goal = state.ledger.goal ?? state.goal ?? null;
  state.workflowPreference =
    state.ledger.workflowPreference ?? state.workflowPreference ?? null;
  state.constraints = state.ledger.constraints;
  state.ledger.platform = state.platform;
  state.ledger.format = toLedgerFormat(state.format);
  state.ledger.visualSource = state.visualSource ?? state.ledger.visualSource;
  // Task 3.8 (Requirement 10.5): the legacy alias `state.topic` MUST mirror
  // `confirmedTopic` only, NOT `topicCandidate`. Downstream gating reads
  // `state.topic` (via `readyForConfirmation`, `buildOpenQuestions`, etc.),
  // so keeping it null when only a candidate is parked prevents the gate
  // from accidentally promoting an exploratory utterance to level 3.
  state.topic = state.ledger.confirmedTopic ?? undefined;
  state.ledger.openQuestions = buildOpenQuestions(state);

  // Task 3.1/3.2 caveat: pendingConfirmation snapshot building is owned by
  // tasks 5.3 / 5.5. We preserve whatever was hydrated from the persisted
  // ledger (`reconstructChiefIntakeState` merge) but do not synthesise a new
  // snapshot here — only those tasks will populate it with the proper schema
  // shape (confirmationId UUID, taskInput, createdAt, etc.). For the gate v3
  // switch (task 3.2), `pendingConfirmation` is no longer required to reach
  // briefMaturity 3; the dispatch generates a fresh `pendingConfirmationId`
  // for the Confirm_Card_Rich payload.
  if (state.ledger.pendingConfirmation === undefined) {
    state.ledger.pendingConfirmation = null;
  }

  // Default-init advisoryNotes/pendingTaskExecution if they are missing
  // (e.g. ledger was reconstructed from a v2 row without those fields).
  if (!Array.isArray(state.ledger.advisoryNotes)) {
    state.ledger.advisoryNotes = [];
  }
  if (state.ledger.pendingTaskExecution === undefined) {
    state.ledger.pendingTaskExecution = null;
  }

  // Re-detect advisory notes on every finalize so stale advisories are
  // dropped when slots change (Requirement 11.1, 11.2, 11.8). Detection is
  // pure and side-effect free; the merge happens here so downstream
  // consumers (Confirm_Card_Rich, Limitations_Card) read a single source
  // of truth from `ledger.advisoryNotes`.
  state.ledger.advisoryNotes = detectAdvisoryNotes(state.ledger);

  // Compute briefMaturity from the now-synced ledger + helper flags.
  state.briefMaturity = determineBriefMaturity(state, now);
  state.ledger.briefMaturity = state.briefMaturity;
  state.ledger.confidence =
    state.briefMaturity >= 3
      ? "high"
      : state.briefMaturity >= 1
        ? "medium"
        : "low";

  // Phase is a legacy descriptor for the existing decision tree; gate v3 uses
  // briefMaturity. Tasks 3.2 onward will simplify this further.
  if (state.cancelled) {
    state.phase = "cancelled";
  } else if (
    state.confirmed &&
    state.readyForConfirmation &&
    state.hasPendingConfirmation
  ) {
    state.phase = "confirmed";
  } else if (state.readyForConfirmation) {
    state.phase = "awaiting_confirmation";
  } else if (
    state.hasContentIntent ||
    state.platform ||
    state.format ||
    state.topic
  ) {
    state.phase = "gathering_context";
  } else {
    state.phase = "understanding_intent";
  }

  return state;
}

export function reconstructChiefIntakeState(
  messages: ChiefMessageLike[],
  now: Date = new Date(),
  options?: {
    persistedLedger?: BriefLedger | null;
    newConfirmationId?: () => string;
  },
) {
  const state = emptyState();

  // Hydrate persisted ledger (Requirement 7.1, 7.6) so pendingConfirmation
  // snapshots and pendingTaskExecution rows survive across requests. Task 5.5
  // owns the persistence side; here we only merge fields that influence the
  // gating switch.
  if (options?.persistedLedger) {
    const persisted = options.persistedLedger;
    state.ledger = { ...state.ledger, ...persisted };
    if (persisted.platform === "instagram" || persisted.platform === "twitter") {
      state.platform = persisted.platform;
    }
    state.ledger.platform = state.platform ?? state.ledger.platform;
    if (persisted.format) {
      state.format = persisted.format;
    }
    if (persisted.visualSource) {
      state.visualSource = persisted.visualSource;
    }
    if (persisted.confirmedTopic) {
      state.topic = persisted.confirmedTopic;
    }
    // Task 3.8 (Requirement 10.5): do NOT hydrate `state.topic` from
    // `topicCandidate`. A parked candidate must stay candidate-only across
    // requests so the gate cannot promote to level 3 without a fresh
    // imperative or wizard/confirm marker (Requirement 10.2).
    if (persisted.goal) state.goal = persisted.goal;
    if (persisted.workflowPreference) {
      state.workflowPreference = persisted.workflowPreference;
    }
    if (persisted.userIntent === "content_creation_interest") {
      state.hasContentIntent = true;
    }
  }

  const signals = extractChiefIntakeSignals(messages);
  for (const signal of signals) {
    applySignal(state, signal, {
      now,
      newConfirmationId: options?.newConfirmationId,
    });
  }
  return finalizeState(state, messages, now);
}

function makePayload(
  message: string,
  question: string,
  options: string[],
): AskUserInputPayload {
  return {
    type: "single_select",
    message,
    questions: [{ question, options: options.slice(0, 4) }],
  };
}

function formatPlatform(platform?: SupportedPlatform) {
  if (platform === "instagram") return "Instagram";
  if (platform === "twitter") return "Twitter/X";
  return "platform yang paling cocok";
}

function formatOutputFormat(format?: SupportedFormat) {
  const map: Record<SupportedFormat, string> = {
    instagram_feed_photo_caption: "Feed foto + caption",
    instagram_carousel_photo: "Carousel foto",
    instagram_carousel: "Carousel foto",
    instagram_reels_script: "Reels script",
    instagram_story_caption: "Story/caption",
    twitter_single_post: "single post",
    twitter_thread: "thread",
    twitter_engagement_launch: "engagement/launch post",
  };
  return format ? map[format] : "format yang paling cocok";
}

/**
 * Format the visual source slot into the Indonesian copy used on the
 * Confirm_Card_Rich summary list (Requirement 4.2).
 *
 * - `internet_reference` → "Dicari tim dari internet"
 * - `user_owned_asset`   → "Memakai asset kamu"
 *
 * Defaults to a neutral "Ditentukan tim sesuai kebutuhan" so the slot row
 * never goes blank if the gate ever lets a `briefMaturity = 3` slip through
 * with `visualSource` cleared (Property 7 of design.md guards against this,
 * but the safe default keeps the UI readable).
 */
function formatVisualSource(visualSource?: VisualSource) {
  if (visualSource === "internet_reference") return "Dicari tim dari internet";
  if (visualSource === "user_owned_asset") return "Memakai asset kamu";
  return "Ditentukan tim sesuai kebutuhan";
}

/**
 * Compose the Indonesian message body shown on the Confirm_Card_Rich. The
 * structure matches Requirement 4.1, 4.2, 4.4 and Property 7 in design.md:
 *
 * - Header line: `"Rencana publish Instagram"`.
 * - Summary list: topik, arah/goal, format, sumber visual, platform, output
 *   target = `"Auto-publish ke Instagram"`, estimasi waktu eksekusi.
 * - Helper text mentioning the 30 second cancellation window.
 *
 * Pulled out as a separate helper so {@link buildConfirmCardRichPayload}
 * can reuse it for both `payload.message` and `assistantText`.
 */
function buildConfirmCardRichMessage(state: ChiefIntakeState) {
  const topic =
    state.topic ?? state.ledger.confirmedTopic ?? "(topik belum jelas)";
  const goal = state.ledger.goal ?? "(arah konten belum jelas)";
  const format = formatOutputFormat(state.format);
  const visual = formatVisualSource(state.visualSource);
  const platform = formatPlatform(state.platform ?? "instagram");

  return [
    "Rencana publish Instagram",
    "",
    `Topik: ${topic}`,
    `Arah: ${goal}`,
    `Format: ${format}`,
    `Sumber visual: ${visual}`,
    `Platform: ${platform}`,
    "Output: Auto-publish ke Instagram",
    "Estimasi waktu: ~3-5 menit setelah window habis",
    "",
    "Setelah konfirmasi, ada window 30 detik untuk membatalkan publish.",
    'Kalau brief belum pas, pilih "Ubah dulu". Kalau ingin batal sepenuhnya, pilih "Batal".',
  ].join("\n");
}

/**
 * Build the v3 Confirm_Card_Rich payload (task 5.3 / Requirement 4.1–4.6,
 * 4.10). The shape is gated by Property 7 in design.md:
 *
 * - `kind === "confirm_brief"` and `pendingConfirmationId` set so
 *   `Scope_Router` dispatches subsequent tool answers via marker, never
 *   regex on the question copy (Requirement 4.6, 8.1, 8.3).
 * - `questions[0].options` is exactly the three label strings in
 *   Requirement 4.3: `"Konfirmasi & mulai publish"`, `"Ubah dulu"`,
 *   `"Batal"`.
 * - `allowFreeText === true` with a placeholder that nudges the user to
 *   write a correction or extra note (Requirement 4.5).
 * - `message` carries the summary list AND the 30-second helper text in
 *   the same string because the AI SDK's askUserInput payload has no
 *   separate `helperText` field (Requirement 4.2, 4.4).
 *
 * The caller (`resolveChiefIntakeDecision`) is responsible for producing or
 * reusing `confirmationId`. Persisting the snapshot row to the
 * `chief_confirmation_idempotency` table is task 5.5; the helper to build
 * the snapshot is {@link buildPendingConfirmationSnapshot}, and the router
 * populates `state.ledger.pendingConfirmation` so the chief-chat endpoint
 * (task 8.1) can call `upsertConfirmationRow` BEFORE emitting this payload
 * to the client (Requirement 7.1, 7.6).
 *
 * Requirement 4.10 ("dirender HANYA SAAT briefMaturity = 3") is enforced
 * by the maturity switch in `resolveChiefIntakeDecision`, not here — this
 * helper is a pure builder.
 */
export function buildConfirmCardRichPayload(
  state: ChiefIntakeState,
  confirmationId: string,
): {
  payload: AskUserInputPayloadV3;
  assistantText: string;
} {
  const message = buildConfirmCardRichMessage(state);
  return {
    payload: {
      type: "single_select",
      message,
      questions: [
        {
          question: "Konfirmasi brief",
          options: ["Konfirmasi & mulai publish", "Ubah dulu", "Batal"],
        },
      ],
      kind: "confirm_brief",
      pendingConfirmationId: confirmationId,
      allowFreeText: true,
      freeTextPlaceholder:
        "Tulis koreksi atau catatan tambahan sebelum publish.",
    },
    assistantText: message,
  };
}

function createDirectorInstruction(args: {
  latestText: string;
  state: ChiefIntakeState;
  mode:
    | "casual"
    | "identity"
    | "capability"
    | "out_of_scope"
    | "unsupported_platform"
    | "confirmation_without_pending"
    | "correction"
    | "gather_context"
    | "missing_topic"
    | "missing_direction"
    | "missing_visual";
  unsupportedPlatform?: UnsupportedPlatformKey | null;
}) {
  const { latestText, state, mode, unsupportedPlatform } = args;
  const ledger = state.ledger;
  const context = [
    `brief maturity: ${state.briefMaturity}`,
    state.hasContentIntent
      ? "user terlihat tertarik membuat konten"
      : "belum ada intent konten yang jelas",
    state.topic ? `topik sementara: ${state.topic}` : "topik belum jelas",
    state.platform
      ? `platform sementara: ${formatPlatform(state.platform)}`
      : "platform belum jelas",
    state.format
      ? `format sementara: ${formatOutputFormat(state.format)}`
      : "format belum jelas",
    ledger.goal ? `tujuan sementara: ${ledger.goal}` : "tujuan belum jelas",
    ledger.workflowPreference
      ? `workflow: ${ledger.workflowPreference}`
      : "workflow belum jelas",
    state.needsVisualSource && !state.visualSource
      ? "sumber visual belum jelas"
      : "",
  ]
    .filter(Boolean)
    .join("; ");

  const base = `User terakhir menulis: "${latestText}". Ledger briefing saat ini: ${context}.`;
  const shared = `
Prinsip Pak Arga:
- Kamu Chief Agent/Creative Director, bukan form wizard.
- Pakai kecerdasan untuk memahami konteks, bukan template keyword.
- Default text natural, bukan kartu pilihan.
- Jangan menganggap kalimat vague sebagai topik.
- Jangan bilang tim sudah bekerja dan jangan membuat task.
- Tanya satu follow-up yang paling berguna saja.
- Bahasa Indonesia natural, hangat, dan ringkas; jangan pakai "bro", "gue/gua", "lu/lo", atau slang berat.`;

  if (mode === "identity") {
    return `${base}${shared}
Jawab siapa Pak Arga secara natural. Setelah itu arahkan halus bahwa kamu bisa membantu merapikan ide konten sosial media kalau user ingin mulai.`;
  }

  if (mode === "capability") {
    return `${base}${shared}
Jelaskan kemampuan Pak Arga tanpa daftar fitur kaku: membantu merapikan ide mentah menjadi brief konten sosial media, lalu tim menyiapkan draft setelah brief dikonfirmasi.`;
  }

  if (mode === "out_of_scope") {
    return `${base}${shared}
Arahkan halus bahwa kebutuhan itu bukan fokus Agen Team sekarang. Kalau mungkin, tawarkan mengubahnya menjadi bahan konten sosial media.`;
  }

  if (mode === "unsupported_platform") {
    const hint = unsupportedPlatform
      ? getInstagramAdaptationHint(unsupportedPlatform).phrase
      : '"thread Twitter" → "Carousel Instagram"';
    return `${base}${shared}
Platform yang aktif sekarang hanya Instagram. Jangan munculkan kartu. Jelaskan halus bahwa idenya tetap bisa diadaptasi ke Instagram, dan WAJIB sebut minimal satu contoh konkret adaptasi seperti ${hint}. Setelah itu tanya mana yang lebih masuk menurut user.`;
  }

  if (mode === "confirmation_without_pending") {
    return `${base}${shared}
User terdengar ingin lanjut, tapi belum ada pending confirmation yang valid. Jangan membuat task. Jelaskan natural bahwa kamu belum punya brief yang cukup/terkonfirmasi, lalu tanya satu hal yang paling kurang.`;
  }

  if (mode === "correction") {
    return `${base}${shared}
User sedang mengoreksi brief atau preferensi. Jangan membuat task. Tanggapi koreksi secara natural, jelaskan bagian yang sudah kamu ubah bila jelas, lalu tanya hal berikutnya yang masih kurang. Kalau brief sudah matang, minta izin untuk merangkum lagi.`;
  }

  if (mode === "missing_topic") {
    return `${base}${shared}
Intent/preferensi sudah ada, tapi topik/bahan utama belum nyata. Jangan pakai kartu. Tanya natural: konten ini mau berangkat dari produk, topik edukasi, cerita brand, promo, masalah audience, atau ide mentah apa.`;
  }

  if (mode === "missing_direction") {
    return `${base}${shared}
Topik sudah mulai ada, tapi arah output belum matang. Jangan pakai kartu. Bantu seasoning ringan: tanya apakah arah kontennya promosi, edukasi, awareness, storytelling, atau platform/format yang user bayangkan.`;
  }

  if (mode === "missing_visual") {
    return `${base}${shared}
Brief Instagram visual-heavy sudah hampir matang, tapi sumber visual belum jelas. Tanya natural apakah visual mau dicarikan dari internet sebagai bahan draft atau memakai asset user sendiri. Jangan membuat task.`;
  }

  if (mode === "gather_context") {
    return `${base}${shared}
User menunjukkan minat konten tapi brief belum matang. Jangan mulai platform/format/topic menu kaku. Pahami konteks dan ajukan satu pertanyaan terbuka yang membantu membentuk brief.`;
  }

  return `${base}${shared}
Ini bisa jadi obrolan santai, pertanyaan, atau ide mentah. Jangan paksa jadi konten. Respons natural sesuai konteks, dan bila ada potensi ide, ajak user cerita sedikit lagi tanpa kartu pilihan.`;
}

function fallbackDirectorText(
  state: ChiefIntakeState,
  mode: Parameters<typeof createDirectorInstruction>[0]["mode"],
  unsupportedPlatform?: UnsupportedPlatformKey | null,
) {
  if (mode === "missing_topic") {
    return "Bisa. Tapi ini masih belum jadi brief. Kontennya mau berangkat dari apa dulu—produk, topik edukasi, cerita brand, promosi, atau ide mentah yang masih ingin dirapikan?";
  }
  if (mode === "missing_direction") {
    return `Oke, ${state.topic} sudah mulai jadi pegangan. Arah kontennya mau lebih ke promosi, edukasi, awareness, cerita brand, atau kamu ingin saya bantu cari angle yang paling masuk?`;
  }
  if (mode === "missing_visual") {
    return "Untuk visualnya, mau tim carikan gambar dari internet sebagai bahan draft, atau kamu sudah punya gambar/asset sendiri?";
  }
  if (mode === "confirmation_without_pending") {
    return "Bisa dilanjutkan, tapi saya belum punya brief yang cukup jelas untuk diteruskan ke tim. Kita rapikan satu bagian dulu: topik atau tujuan kontennya apa?";
  }
  if (mode === "unsupported_platform") {
    const hint = unsupportedPlatform
      ? getInstagramAdaptationHint(unsupportedPlatform).phrase
      : '"thread Twitter" → "Carousel Instagram"';
    return `Untuk sekarang yang aktif baru Instagram, idenya tetap bisa kita adaptasi—misalnya ${hint}. Mau diarahkan ke Instagram atau belum?`;
  }
  if (mode === "identity") {
    return "Saya Pak Arga, Chief Agent yang membantu merapikan ide menjadi brief konten sebelum tim mulai bekerja. Kalau kamu punya ide mentah, saya bantu bentuk pelan-pelan.";
  }
  if (mode === "capability") {
    return "Saya bisa bantu mengubah ide mentah menjadi brief konten sosial media yang siap dikerjakan tim. Kalau idenya belum rapi, ceritakan dulu bagian yang paling kebayang.";
  }
  return "Saya tangkap ini belum tentu brief konten. Kalau masih obrolan santai, tidak masalah. Kalau ada ide yang ingin diolah, ceritakan sedikit lagi dan saya bantu rapikan arahnya.";
}

function directorTextDecisionV3(
  latestText: string,
  state: ChiefIntakeState,
  mode: Parameters<typeof createDirectorInstruction>[0]["mode"] = "casual",
  unsupportedPlatform: UnsupportedPlatformKey | null = null,
): IntakeDecision {
  return {
    type: "director_text",
    instruction: createDirectorInstruction({
      latestText,
      state,
      mode,
      unsupportedPlatform,
    }),
    fallbackText: fallbackDirectorText(state, mode, unsupportedPlatform),
    state,
  };
}

function buildTaskBrief(state: ChiefIntakeState) {
  const parts = [
    `Buat dan upload konten Instagram tentang ${state.topic}.`,
    `Arah konten: ${state.ledger.goal ?? "ditentukan tim dari brief"}.`,
    state.format
      ? `Format: ${formatOutputFormat(state.format)}.`
      : "Format: Feed foto + caption atau Carousel foto sesuai brief.",
    state.visualSource === "internet_reference"
      ? "Tim mencari gambar dari internet sebagai bahan visual upload dan mencantumkan sumber/referensi internal bila tersedia."
      : "Gunakan asumsi visual berasal dari asset user bila diberikan; jika tidak, gunakan fallback visual yang aman untuk MVP upload.",
    "Pak Arga hanya mengunci brief garis besar; caption, hook, CTA, visual, dan detail kreatif dikerjakan oleh tim internal.",
    "Hasil akhir harus benar-benar diunggah ke Instagram yang sudah terhubung.",
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildCreateTaskInputFromState(
  state: ChiefIntakeState,
): DirectChiefTaskInput {
  const requirements = [
    "Hasil akhir harus benar-benar diunggah ke Instagram yang sudah terhubung.",
    "Pak Arga hanya mengunci brief garis besar; tim internal mengurus caption, hook, visual, CTA, dan upload.",
    "Format upload yang didukung saat ini hanya Feed foto + caption atau Carousel foto.",
    "Intelijen mencari insight, referensi visual, dan validasi klaim sebelum Marketing menyusun materi.",
    "Marketing menyusun angle, copy, CTA, dan platform fit berdasarkan insight yang aman.",
  ];

  if (state.visualSource === "internet_reference") {
    requirements.push(
      "Gambar internet hanya boleh dipakai sebagai bahan draft/referensi visual.",
      "Cantumkan sumber gambar dan jangan klaim sebagai asset milik user.",
    );
  }

  if (state.visualSource === "user_owned_asset") {
    requirements.push(
      "Gunakan asumsi visual berasal dari gambar atau asset milik user.",
      "Fokus pada struktur konten, copy, caption, CTA, dan arahan penempatan visual.",
    );
  }

  return {
    intentType: "full_auto_publish",
    topic: state.topic ?? "Konten sosial media",
    brief: buildTaskBrief(state),
    platform: "Instagram",
    outputFormat: state.format ? formatOutputFormat(state.format) : undefined,
    maxSources: 8,
    needsPhoto: true,
    requirements,
  };
}

/**
 * Build the v3 {@link SchemaPendingConfirmation} snapshot for a task-ready
 * brief at maturity level 3 (task 5.5 / Requirement 7.1, 7.2, 7.3, 7.5, 7.6).
 *
 * The snapshot is the **single source of truth** for what eventually gets
 * sent to `enqueueAgenTeamTask`: once persisted to
 * `chief_confirmation_idempotency`, the Inngest cancellation-window handler
 * (task 7.2) reads `taskInput` from the row, never rebuilds it from the
 * (possibly mutated) Brief_Ledger. This guarantees the payload-freeze
 * property (design.md Property 3): what the user saw on Confirm_Card_Rich
 * is exactly what runs.
 *
 * Required ledger preconditions (the maturity switch in
 * {@link resolveChiefIntakeDecision} only enters level 3 when these are
 * present, but we re-validate here via Zod for defensive correctness):
 *
 * - `state.ledger.confirmedTopic` must be a non-empty string.
 * - `state.ledger.format` must be one of the v3 active Instagram formats.
 * - `state.ledger.goal` must be a non-empty string.
 * - `state.ledger.visualSource` must be one of the supported sources.
 *
 * The auto-publish contract literals (`intentType: "full_auto_publish"`,
 * `output: "publish_to_instagram"`, `publish: true`, `platform:
 * "instagram"`) are pinned per Requirement 1.7. `taskInput` is built via
 * {@link buildCreateTaskInputFromState} so the persisted snapshot mirrors
 * what the legacy create_task path would have emitted.
 *
 * The caller is responsible for actually persisting the snapshot via
 * `upsertConfirmationRow` (the chief-chat endpoint owns the DB write in
 * task 8.1). This helper is exported so retries / idempotent re-emissions
 * can rebuild the same shape from a hydrated state without duplicating
 * field assembly.
 *
 * @param state - Reconstructed {@link ChiefIntakeState} at maturity 3.
 * @param confirmationId - Stable UUID v4 for the confirmation row.
 * @param now - Current time, used for `createdAt` (injected for tests).
 *
 * @see Requirement 1.7, 7.1, 7.2, 7.3, 7.5, 7.6
 */
export function buildPendingConfirmationSnapshot(
  state: ChiefIntakeState,
  confirmationId: string,
  now: Date = new Date(),
): SchemaPendingConfirmation {
  const ledger = state.ledger;
  return PendingConfirmationSchema.parse({
    confirmationId,
    topic: ledger.confirmedTopic ?? state.topic ?? "",
    platform: "instagram",
    format: ledger.format,
    goal: ledger.goal ?? "",
    audience: ledger.audience ?? null,
    visualSource: ledger.visualSource,
    intentType: "full_auto_publish",
    output: "publish_to_instagram",
    publish: true,
    taskInput: buildCreateTaskInputFromState(state),
    createdAt: now.toISOString(),
  });
}

function buildGoalPayload(state: ChiefIntakeState): AskUserInputPayload {
  const topicText = state.topic ? ` untuk ${state.topic}` : "";
  return makePayload(
    `Arah kontennya mau dibuat seperti apa${topicText}?`,
    "Pilih arah konten",
    ["Produk", "Edukasi", "Promosi", "Cerita brand"],
  );
}

function buildFormatPayload(state: ChiefIntakeState): AskUserInputPayload {
  const topicText = state.topic ? ` tentang ${state.topic}` : " ini";
  return makePayload(
    `Mau dibuat dalam bentuk apa untuk Instagram${topicText}?`,
    "Pilih format upload",
    ["Feed foto + caption", "Carousel foto"],
  );
}

function buildVisualPayload(): AskUserInputPayload {
  return makePayload(
    "Untuk visualnya, tim carikan gambar dari internet atau kamu punya gambar sendiri?",
    "Sumber visual",
    ["Carikan gambar dari internet", "Saya punya gambar sendiri"],
  );
}

function getLatestSignal(signals: IntakeSignal[]) {
  return signals.at(-1) ?? null;
}

function getDecisionModeForIncompleteBrief(state: ChiefIntakeState) {
  if (state.topic && state.needsVisualSource && !state.visualSource) {
    return "missing_visual" as const;
  }
  if (!state.topic) return "missing_topic" as const;
  if (!state.platform && !state.format && !state.ledger.goal) {
    return "missing_direction" as const;
  }
  return "gather_context" as const;
}

/**
 * Format the ledger platform value for the wizard prelude. Returns
 * `null` when the slot is not yet known so the caller can omit the chunk.
 */
function formatPlatformForSummary(
  platform: BriefLedger["platform"] | undefined,
): string | null {
  if (platform === "instagram") return "Instagram";
  if (platform === "twitter") return "Twitter/X";
  return null;
}

/**
 * Format the ledger format slot for the wizard prelude.
 */
function formatFormatForSummary(
  format: BriefLedger["format"] | undefined,
): string | null {
  if (!format) return null;
  if (format === "instagram_carousel_photo") return "Carousel foto";
  if (format === "instagram_feed_photo_caption") return "Feed foto + caption";
  return null;
}

/**
 * Build a one-line prelude summarising slots Chief has already inferred from
 * the ledger so the user knows what is already known before answering the
 * next wizard question (Requirement 3.10).
 *
 * Example outputs:
 * - All known: `"Saya sudah catat: Instagram, Carousel foto, topik 'Burger
 *   lokal', goal edukasi, visual dari internet."`
 * - Some known: `"Saya sudah catat: Instagram, format Carousel foto."`
 * - None known: `""` (caller can render the question without prelude).
 *
 * The function is pure and deterministic — generated text only depends on
 * the current ledger snapshot.
 */
export function summarizeKnownSlots(ledger: BriefLedger): string {
  const chunks: string[] = [];

  const platform = formatPlatformForSummary(ledger.platform);
  if (platform) chunks.push(platform);

  const format = formatFormatForSummary(ledger.format);
  if (format) chunks.push(`format ${format}`);

  if (ledger.confirmedTopic) {
    chunks.push(`topik '${ledger.confirmedTopic}'`);
  }

  if (ledger.goal) {
    chunks.push(`goal ${ledger.goal}`);
  }

  if (ledger.visualSource === "internet_reference") {
    chunks.push("visual dari internet");
  } else if (ledger.visualSource === "user_owned_asset") {
    chunks.push("visual dari aset kamu");
  }

  if (chunks.length === 0) return "";
  return `Saya sudah catat: ${chunks.join(", ")}.`;
}

/**
 * Compose the wizard `message` field by combining the optional ledger
 * summary prelude with the slot-specific question copy. Returns the
 * standalone question when there is nothing yet to recap so we never emit
 * an empty leading line (Requirement 3.10).
 */
function composeWizardMessage(prelude: string, question: string): string {
  if (!prelude) return question;
  return `${prelude}\n\n${question}`;
}

/**
 * Pick the highest-priority missing slot (topic → goal → format → visual).
 * Slots already valid in the ledger are skipped (Requirement 3.1). Returns
 * `null` when every required slot is filled — defensively, that case is
 * handled at level 3 by the confirm-card builder, not the wizard.
 */
function pickMissingWizardSlot(
  state: ChiefIntakeState,
): "topic" | "goal" | "format" | "visual" | null {
  if (!state.topic) return "topic";
  if (!state.ledger.goal) return "goal";
  if (!state.format) return "format";
  if (!state.visualSource) return "visual";
  return null;
}

/**
 * Build the v3 Wizard_Card payload for `briefMaturity = 2`.
 *
 * Selects the single highest-priority missing slot, skipping every slot
 * already recorded in the ledger (Requirement 3.1, 3.2). Each emission
 * keeps the invariants required by Property 8 / Requirements 3.3, 3.4:
 *
 * - `kind` is `"wizard_<slot>"`,
 * - `allowFreeText` is always `true`,
 * - `questions.length` is exactly 1 (≤ 3) and `options.length` ≤ 4,
 * - `message` carries an optional ledger summary prelude (Requirement 3.10)
 *   followed by the slot-specific question copy so the user always sees
 *   what Chief has already inferred.
 *
 * If, defensively, no slot is missing (the gate should have promoted the
 * state to level 3 before entering the wizard branch), the function falls
 * back to a generic goal-style payload so the AI SDK still has a valid
 * `askUserInput` to round-trip.
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 3.1, 3.2, 3.3, 3.4, 3.10
 */
export function buildWizardCardPayload(state: ChiefIntakeState): {
  payload: AskUserInputPayloadV3;
  assistantText: string;
} {
  const prelude = summarizeKnownSlots(state.ledger);
  const slot = pickMissingWizardSlot(state);

  if (slot === "topic") {
    const question =
      "Mau bikin konten Instagram tentang apa? Jelaskan topik utamanya.";
    const base = makePayload(question, "Topik konten", [
      "Produk/jasa",
      "Edukasi",
      "Cerita brand",
      "Promosi",
    ]);
    return {
      payload: {
        ...base,
        message: composeWizardMessage(prelude, question),
        kind: "wizard_topic",
        allowFreeText: true,
        freeTextPlaceholder:
          'Tulis topik bebas, misalnya "burger lokal" atau "kesalahan skincare"',
      },
      assistantText: "Mau bikin konten tentang apa?",
    };
  }

  if (slot === "goal") {
    const base = buildGoalPayload(state);
    const question = base.message ?? "Arah kontennya mau dibuat seperti apa?";
    return {
      payload: {
        ...base,
        message: composeWizardMessage(prelude, question),
        kind: "wizard_goal",
        allowFreeText: true,
        freeTextPlaceholder:
          'Atau tulis arah konten kamu sendiri, misalnya "awareness".',
      },
      assistantText: question,
    };
  }

  if (slot === "format") {
    const base = buildFormatPayload(state);
    const question = base.message ?? "Mau dibuat dalam bentuk apa?";
    return {
      payload: {
        ...base,
        message: composeWizardMessage(prelude, question),
        kind: "wizard_format",
        allowFreeText: true,
        freeTextPlaceholder:
          'Atau tulis preferensi format kamu, misalnya "single feed".',
      },
      assistantText: question,
    };
  }

  if (slot === "visual") {
    const base = buildVisualPayload();
    const question = base.message ?? "Sumber visualnya dari mana?";
    return {
      payload: {
        ...base,
        message: composeWizardMessage(prelude, question),
        kind: "wizard_visual",
        allowFreeText: true,
        freeTextPlaceholder:
          'Atau jelaskan sumber visualnya, misalnya "foto produk dari studio".',
      },
      assistantText: question,
    };
  }

  // Defensive fallback: every required slot is filled but the gate routed
  // the state into the wizard branch anyway. Emit a generic goal-style
  // payload so callers always receive a valid Wizard_Card payload while
  // the prelude still lets the user verify what Chief has on file.
  const base = buildGoalPayload(state);
  const question = base.message ?? "Bantu jelasin sedikit lagi tentang briefnya.";
  return {
    payload: {
      ...base,
      message: composeWizardMessage(prelude, question),
      kind: "wizard_goal",
      allowFreeText: true,
    },
    assistantText: question,
  };
}

/**
 * Resolve the next intake decision for Chief Chat (Pak Arga) v3.
 *
 * The switch is gated **entirely** by `state.briefMaturity` (Requirement 2.8,
 * design Property 1). Helper flags such as `readyForConfirmation`,
 * `confirmed`, and `correctionRequested` only fine-tune behaviour *within*
 * a level. Each maturity level maps to exactly one {@link IntakeDecision}
 * variant:
 *
 * - `0` → `director_text` (vague intent / casual chat).
 * - `1` → `director_text` (one preference, ask for the missing topic).
 * - `2` → `ask_user_input` with `kind = "wizard_<slot>"` (slot skipping).
 * - `3` → `ask_user_input` with `kind = "confirm_brief"` and a freshly
 *         generated `pendingConfirmationId` (Requirement 4.6, 7.6). The
 *         {@link SchemaPendingConfirmation} snapshot is built via
 *         {@link buildPendingConfirmationSnapshot} and stashed on
 *         `decision.state.ledger.pendingConfirmation`; the chief-chat
 *         endpoint (task 8.1) MUST call `upsertConfirmationRow` with this
 *         snapshot BEFORE emitting the askUserInput payload to the client
 *         (Requirement 7.1).
 * - `4` → `open_cancellation_window` (or `cancel_window_acknowledged` after
 *         the user cancels the running window via marker `cancel_window`).
 * - `5` → `ready_for_story` with the enqueued task id (Requirement 13.5).
 *
 * The legacy `create_task`, `publish_gate`, and `text` decision variants are
 * **not** produced by v3 — task 7.2 owns enqueue (Inngest) and task 5.x
 * cleans up legacy publish gating. The wider {@link ChiefIntakeDecision}
 * union still keeps those variants exported as the compile-time return type
 * so legacy unit tests and the chief-chat route keep type-checking until
 * task 8.1 migrates the consumer; at runtime the function only ever returns
 * one of the v3 {@link IntakeDecision} variants.
 *
 * @param args.messages - Full UI message history (user + tool answers).
 * @param args.persistedLedger - Optional persisted ledger row hydrated from
 *   `chief_brief_ledger` (task 1.5). When present, `pendingConfirmation` and
 *   `pendingTaskExecution` survive across requests.
 * @param args.now - Current time (defaults to `new Date()`); injected for
 *   determinism + property tests.
 * @param args.newConfirmationId - UUID generator (defaults to
 *   `node:crypto.randomUUID`); injected so tests can pin the IDs.
 *
 * @see Requirement 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */
export function resolveChiefIntakeDecision(
  args: {
    messages: ChiefMessageLike[];
    persistedLedger?: BriefLedger | null;
    now?: Date;
    newConfirmationId?: () => string;
  },
): ChiefIntakeDecision;
/**
 * Backward-compatible positional overload — accepts a raw messages array
 * for legacy call sites (chief-chat route pre-task 8.1, scope-router unit
 * tests). Internally delegates to the args-object form with default
 * injectors.
 */
export function resolveChiefIntakeDecision(
  messages: ChiefMessageLike[],
): ChiefIntakeDecision;
export function resolveChiefIntakeDecision(
  argsOrMessages:
    | ChiefMessageLike[]
    | {
        messages: ChiefMessageLike[];
        persistedLedger?: BriefLedger | null;
        now?: Date;
        newConfirmationId?: () => string;
      },
): ChiefIntakeDecision {
  const args = Array.isArray(argsOrMessages)
    ? { messages: argsOrMessages }
    : argsOrMessages;
  const messages = args.messages;
  const now = args.now ?? new Date();
  const newConfirmationId = args.newConfirmationId ?? randomUUID;
  const persistedLedger = args.persistedLedger ?? null;

  const signals = extractChiefIntakeSignals(messages);
  const latestSignal = getLatestSignal(signals);
  const latestText = latestSignal?.text ?? "";
  const state = reconstructChiefIntakeState(messages, now, {
    persistedLedger,
    newConfirmationId,
  });

  // Defensive guards that bypass the maturity switch with director_text:
  // identity/capability/out-of-scope and unsupported-platform questions are
  // recognised regardless of maturity because they ARE valid casual chat
  // (Requirement 12.1, 12.2). v3 still uses director_text — no kartu kaku.
  if (latestText && isIdentityQuestion(latestText)) {
    return directorTextDecisionV3(latestText, state, "identity");
  }
  if (latestText && isCapabilityQuestion(latestText)) {
    return directorTextDecisionV3(latestText, state, "capability");
  }
  if (latestText && isOutOfScopeRequest(latestText)) {
    return directorTextDecisionV3(latestText, state, "out_of_scope");
  }
  // Task 6.6 — honest unsupported platform handling
  // (Requirement 12.1, 12.2, 12.3, 12.4, 12.5).
  //
  // The branch fires when:
  //   - the user just mentioned an unsupported platform (`latestText`
  //     matches `isUnsupportedPlatformRequest`), OR
  //   - `applySignal` parked an `unsupportedPlatform` value from an
  //     earlier turn AND the brief has not yet reached task-ready
  //     maturity 3+ (a brief that already passed platform discussion
  //     should not be derailed by stale state).
  //
  // We do NOT block on `state.platform` like the legacy v2 check did —
  // `emptyState` defaults `state.platform = "instagram"` so that check
  // never fired. v3 simply requires that the user surfaced an
  // unsupported platform name and has not yet locked in an Instagram
  // brief.
  const latestUnsupportedPlatformKey = latestText
    ? detectUnsupportedPlatformName(latestText)
    : null;
  if (
    latestUnsupportedPlatformKey ||
    (state.unsupportedPlatform && state.briefMaturity < 3)
  ) {
    // Detect WHICH unsupported platform the user mentioned so we can emit
    // a CONCRETE adaptation hint to Instagram (Requirement 12.3) instead
    // of the generic v2 line. Prefer the latest user message so the hint
    // matches what the user just said; fall back to the parked state
    // value when the latest message is, for example, a generic follow-up
    // ("ya pokoknya itu aja").
    const platformKey =
      latestUnsupportedPlatformKey ??
      (state.unsupportedPlatform
        ? detectUnsupportedPlatformName(state.unsupportedPlatform)
        : null);

    // Limitations_Card emission is reserved for REPEATED requests
    // (Requirement 12.5). On the first mention we always stay on
    // `director_text` — kartu kaku is too aggressive for a single
    // mention. Counting only `user` role messages with raw text parts
    // ensures the count reflects user intent, not Chief's own
    // follow-ups.
    const unsupportedMentionCount = countUnsupportedPlatformMentions(messages);
    const isRepeated = unsupportedMentionCount >= 2;

    if (isRepeated && platformKey) {
      const hint = getInstagramAdaptationHint(platformKey);
      const platformLabel = formatUnsupportedPlatformLabel(platformKey);
      const payload: AskUserInputPayloadV3 = {
        type: "single_select",
        message: `${platformLabel} belum aktif di sistem ini. Idenya tetap bisa diadaptasi: ${hint.phrase}. Mau saya bantu adaptasi ke Instagram?`,
        questions: [
          {
            question: `Adaptasi ide ke Instagram?`,
            options: ["Mengerti, lanjut", "Ganti pendekatan"],
          },
        ],
        // Card-level `kind` identifies the Limitations_Card shape; the
        // overlay (task 10.3) routes to LimitationsCard whenever
        // `kind ∈ {"advisory_continue", "advisory_change"}`. This card
        // NEVER carries `confirm_brief` so it cannot accidentally arm
        // the cancellation window for an unsupported platform
        // (Requirement 12.4).
        kind: "advisory_continue",
        allowFreeText: false,
      };
      return {
        type: "ask_user_input",
        payload,
        assistantText: payload.message ?? "",
        state,
      };
    }

    return directorTextDecisionV3(
      latestText || state.unsupportedPlatform || "",
      state,
      "unsupported_platform",
      platformKey,
    );
  }

  // Special-case `cancel_window`: the user clicked "Batalkan publish" during
  // the cancellation window. `applySignal` already marked
  // `pendingTaskExecution.cancelled = true`, so `determineBriefMaturity`
  // legitimately drops out of level 4. We still need to acknowledge the
  // cancellation explicitly (Requirement 5.6) before returning to the
  // briefing, so emit `cancel_window_acknowledged` regardless of the
  // recomputed maturity.
  if (
    latestSignal?.kind === "tool_answer" &&
    latestSignal.marker === "cancel_window" &&
    state.ledger.pendingTaskExecution?.confirmationId
  ) {
    return {
      type: "cancel_window_acknowledged",
      confirmationId: state.ledger.pendingTaskExecution.confirmationId,
      state,
    };
  }

  // v3 correction marker override (Requirement 9.1): when the user clicks
  // "Ubah dulu" on Confirm_Card_Rich, `applySignal` has already dropped
  // `pendingConfirmation` + `pendingTaskExecution` and stashed the displaced
  // id on `state.replacedConfirmationId`. Instead of re-emitting
  // Confirm_Card_Rich (which would be confusing because the user explicitly
  // asked to change something), we send a director_text that asks which
  // part the user wants to change. The endpoint (task 8.1) reads
  // `state.replacedConfirmationId` and calls `markConfirmationCancelled` on
  // the legacy idempotency row BEFORE emitting the next card on a follow-up
  // turn (Requirement 9.4d, 9.5).
  //
  // Free-text correction (e.g. "ganti jadi promo kopi susu aja") flows
  // through a different path: `applySignal` drops `pendingConfirmation` AND
  // re-parses slots via the Slot_Detector pipeline in the same pass, so the
  // maturity switch below naturally re-emits Confirm_Card_Rich at level 3
  // with a fresh `confirmationId` (Requirement 9.4). We DO NOT trigger the
  // director_text override on free-text corrections because the user already
  // told us what to change.
  if (
    latestSignal?.kind === "tool_answer" &&
    latestSignal.marker === "correction"
  ) {
    return directorTextDecisionV3(latestText, state, "correction");
  }

  // Task 8.4 — surface non-retryable enqueue failures (Requirement 13.6).
  // The Inngest handler `chiefExecuteConfirmation` may have run AFTER the
  // chief-chat request that opened the cancellation window already
  // returned, so the next request is the first opportunity to flush a
  // `createAgenTeamTask` tool output with `readyForStory: false` to the
  // chat-bot UI. The persisted ledger carries `pendingTaskExecution.
  // failureStatus` (set by `markConfirmationFailed`); whenever it is
  // non-null we emit the dedicated `task_failed` decision regardless of
  // the recomputed maturity. The chief-chat dispatch (task 8.1) clears
  // the failure flag from the ledger after the emission so the UI does
  // not see the same error twice.
  const pendingExecutionFailure = state.ledger.pendingTaskExecution;
  if (
    pendingExecutionFailure &&
    pendingExecutionFailure.failureStatus &&
    pendingExecutionFailure.enqueuedAt === null &&
    pendingExecutionFailure.cancelled === false
  ) {
    return {
      type: "task_failed",
      confirmationId: pendingExecutionFailure.confirmationId,
      failureStatus: pendingExecutionFailure.failureStatus,
      failureMessage: pendingExecutionFailure.failureMessage ?? null,
      state,
    };
  }

  // Property 1: gate semantics ditentukan sepenuhnya oleh briefMaturity.
  switch (state.briefMaturity) {
    case 5: {
      // Task already enqueued. The taskId is the same as the confirmationId
      // (Requirement 6.1, 6.2, 7.6).
      const taskId = state.ledger.pendingTaskExecution?.confirmationId ?? "";
      return {
        type: "ready_for_story",
        taskId,
        state,
      };
    }

    case 4: {
      const pendingExecution = state.ledger.pendingTaskExecution;
      // Defensive: scheduledExecuteAt must be valid (Requirement 2.9). If the
      // schedule is missing/invalid, fall back to maturity 3 emission so the
      // next round can rebuild the window.
      if (
        !pendingExecution ||
        Number.isNaN(Date.parse(pendingExecution.scheduledExecuteAt))
      ) {
        const confirmationId =
          state.ledger.pendingConfirmation?.confirmationId ??
          newConfirmationId();
        // Task 5.5: build and stash the snapshot on the ledger so the
        // chief-chat endpoint (task 8.1) can persist via
        // `upsertConfirmationRow` BEFORE emitting the payload to the client
        // (Requirement 7.1, 7.6). The snapshot is the single source of
        // truth for `taskInput`; the Inngest handler (task 7.2) reads it
        // back via `loadPendingConfirmationSnapshot` instead of rebuilding
        // from the (possibly mutated) ledger (Requirement 7.2, 7.3).
        state.ledger.pendingConfirmation = buildPendingConfirmationSnapshot(
          state,
          confirmationId,
          now,
        );
        const { payload, assistantText } = buildConfirmCardRichPayload(
          state,
          confirmationId,
        );
        return {
          type: "ask_user_input",
          payload,
          assistantText,
          state,
        };
      }

      // The window is armed. The `cancel_window` marker is already handled
      // by the early-return above (it transitions maturity out of 4).
      return {
        type: "open_cancellation_window",
        confirmationId: pendingExecution.confirmationId,
        scheduledExecuteAt: pendingExecution.scheduledExecuteAt,
        state,
      };
    }

    case 3: {
      // Brief is task-ready, but if there are unresolved advisory notes
      // we MUST surface them BEFORE Confirm_Card_Rich so the user can
      // pick "Mengerti, lanjut" or "Ganti pendekatan" (Requirement 11.3,
      // 11.4, 11.5, 11.6, 11.7). The advisory does NOT block
      // confirmation: once the user clicks "Mengerti, lanjut",
      // `applySignal` sets `state.advisoryAcknowledged = true` and the
      // gate falls through to the Confirm_Card_Rich emission below
      // (Property 10 in design.md).
      //
      // The `pendingConfirmationId` rendered on Limitations_Card is
      // shared with the eventual Confirm_Card_Rich snapshot so the
      // client can round-trip the same id and `Scope_Router` can match
      // both cards to the same idempotency row (Requirement 4.6, 7.6).
      if (
        state.ledger.advisoryNotes.length > 0 &&
        state.advisoryAcknowledged !== true
      ) {
        const note = state.ledger.advisoryNotes[0];
        const advisoryConfirmationId =
          state.ledger.pendingConfirmation?.confirmationId ??
          newConfirmationId();
        const payload: AskUserInputPayloadV3 = {
          type: "single_select",
          message: note.body,
          questions: [
            {
              question: note.title,
              options: ["Mengerti, lanjut", "Ganti pendekatan"],
            },
          ],
          // Card-level `kind` identifies the Limitations_Card shape; the
          // two buttons emit their own `advisory_continue` /
          // `advisory_change` markers on submission. `InteractiveOverlay`
          // (task 10.3) routes to LimitationsCard whenever
          // `kind ∈ {"advisory_continue", "advisory_change"}`, so we use
          // the continue marker as the canonical card identifier.
          kind: "advisory_continue",
          pendingConfirmationId: advisoryConfirmationId,
          allowFreeText: false,
        };
        return {
          type: "ask_user_input",
          payload,
          assistantText: note.body,
          state,
        };
      }

      // Brief is task-ready: emit Confirm_Card_Rich with a fresh
      // `pendingConfirmationId`. Task 5.5 persists the snapshot in
      // `state.ledger.pendingConfirmation` so the chief-chat endpoint
      // (task 8.1) can call `upsertConfirmationRow` BEFORE the payload
      // hits the wire. Reuse an in-flight
      // `pendingConfirmation.confirmationId` from the persisted ledger
      // when available so retries do not rotate the id (Requirement 7.6,
      // 9.5) — this also keeps the snapshot stable across retries.
      const confirmationId =
        state.ledger.pendingConfirmation?.confirmationId ?? newConfirmationId();
      // Build (or rebuild) the snapshot every emission so corrections that
      // updated slots between rounds are reflected. Reusing the same
      // `confirmationId` keeps idempotency on the DB row; the snapshot
      // payload is the freeze contract per Requirement 7.2.
      state.ledger.pendingConfirmation = buildPendingConfirmationSnapshot(
        state,
        confirmationId,
        now,
      );
      const { payload, assistantText } = buildConfirmCardRichPayload(
        state,
        confirmationId,
      );
      return {
        type: "ask_user_input",
        payload,
        assistantText,
        state,
      };
    }

    case 2: {
      // Topic candidate present, at least one required slot still missing.
      const { payload, assistantText } = buildWizardCardPayload(state);
      return {
        type: "ask_user_input",
        payload,
        assistantText,
        state,
      };
    }

    case 1: {
      // One preference filled (platform or format) but no topic yet.
      // Director_text asks for the missing piece (Requirement 2.3).
      return directorTextDecisionV3(latestText, state, "missing_topic");
    }

    case 0:
    default: {
      // Vague intent / casual chat / out-of-scope (Requirement 2.2).
      if (!latestText) {
        return directorTextDecisionV3("", state, "casual");
      }
      if (!state.hasContentIntent) {
        return directorTextDecisionV3(latestText, state, "casual");
      }
      return directorTextDecisionV3(
        latestText || state.lastSignalText || "ingin merapikan ide konten",
        state,
        getDecisionModeForIncompleteBrief(state),
      );
    }
  }
}

export function getIncompleteContentBriefAskUserInputPayload(): AskUserInputPayload {
  return makePayload(
    "Biar tidak melebar, pilih dulu arah konten Instagram-nya.",
    "Pilih arah konten",
    ["Produk", "Edukasi", "Promosi", "Cerita brand"],
  );
}

export function classifyAgenTeamScope(
  text: string,
): AgenTeamScopeClassification {
  if (isOutOfScopeRequest(text)) return "out_of_scope";
  if (isVagueContentCreationRequest(text) || isPartialSlotAnswer(text)) {
    return "in_scope_ambiguous";
  }
  if (hasMeaningfulTopic(text)) return "in_scope_clear";
  return "in_scope_ambiguous";
}

export function shouldForceAskUserInput(_text: string): boolean {
  // Agentic Chief v3 is text-first. askUserInput is no longer the default
  // clarification mechanism; it is reserved for confirmation and publish gates.
  return false;
}

export function getForcedAskUserInputPayload(
  _text: string,
): AskUserInputPayload {
  return getIncompleteContentBriefAskUserInputPayload();
}

export function getDirectChiefTaskInput(
  _text: string,
): DirectChiefTaskInput | null {
  // Agentic Chief v3 rule: no direct task from raw text. A task is created only
  // after a pending confirmation exists and the user explicitly confirms it.
  return null;
}
