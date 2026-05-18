import { describe, expect, it } from "vitest";
import {
  type AskUserInputPayloadV3,
  type BriefLedger,
  type ChiefMessageLike,
  resolveChiefIntakeDecision,
} from "./scope-router";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function userText(text: string): ChiefMessageLike {
  return {
    role: "user",
    parts: [{ type: "text", text }],
  };
}

/**
 * Stable test UUID used as `pendingConfirmationId` in confirmation flows so
 * assertions can pin the exact value end-to-end (Requirement 4.6, 7.6).
 */
const TEST_PENDING_CONFIRMATION_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Assistant message that emits the v3 Confirm_Card_Rich tool input. The
 * marker (`kind = "confirm_brief"`) and `pendingConfirmationId` live on the
 * tool input so `Scope_Router` can dispatch the confirmation deterministically
 * without regex-matching the question copy (Requirement 4.6, 8.1, 8.3).
 */
function assistantConfirmation(
  pendingConfirmationId: string = TEST_PENDING_CONFIRMATION_ID,
): ChiefMessageLike {
  return {
    role: "assistant",
    parts: [
      {
        type: "tool-askUserInput",
        state: "input-available",
        input: {
          type: "single_select",
          kind: "confirm_brief",
          pendingConfirmationId,
          questions: [
            {
              question: "Konfirmasi brief",
              options: ["Konfirmasi & mulai publish", "Ubah dulu", "Batal"],
            },
          ],
        },
      },
    ],
  };
}

/**
 * Tool answer round-trip with v3 marker dispatch. The marker travels back on
 * the `input.kind` so `extractToolAnswerMarker` reads it; the user's actual
 * response goes on `output` as the question→answer pair (Requirement 8.1,
 * 8.3, 8.4). This mirrors the wire shape after the AI SDK transitions a
 * tool-askUserInput part from `input-available` to `output-available`.
 */
function toolAnswerWithMarker(
  question: string,
  answer: string,
  marker: string,
  pendingConfirmationId: string = TEST_PENDING_CONFIRMATION_ID,
): ChiefMessageLike {
  return {
    role: "assistant",
    parts: [
      {
        type: "tool-askUserInput",
        state: "output-available",
        input: {
          type: "single_select",
          kind: marker,
          pendingConfirmationId,
          questions: [{ question, options: [answer] }],
        },
        output: { [question]: answer },
      },
    ],
  };
}

/**
 * Build a persisted `BriefLedger` row with an active `pendingConfirmation`
 * snapshot for the mature skincare brief used by the confirm/correction
 * tests. v3 only enters `briefMaturity = 4` when the ledger row carrying
 * the snapshot is hydrated by `reconstructChiefIntakeState`
 * (Requirement 7.1, 7.6).
 */
function persistedSkincareLedger(
  pendingConfirmationId: string = TEST_PENDING_CONFIRMATION_ID,
): BriefLedger {
  return {
    userIntent: "content_creation_interest",
    platform: "instagram",
    format: "instagram_carousel_photo",
    topicCandidate: "Kesalahan skincare remaja",
    confirmedTopic: "Kesalahan skincare remaja",
    goal: "edukasi",
    audience: null,
    workflowPreference: null,
    visualSource: "internet_reference",
    constraints: [],
    openQuestions: [],
    confidence: "high",
    briefMaturity: 3,
    advisoryNotes: [],
    pendingTaskExecution: null,
    pendingConfirmation: {
      confirmationId: pendingConfirmationId,
      topic: "Kesalahan skincare remaja",
      platform: "instagram",
      format: "instagram_carousel_photo",
      goal: "edukasi",
      audience: null,
      visualSource: "internet_reference",
      intentType: "full_auto_publish",
      output: "publish_to_instagram",
      publish: true,
      taskInput: {
        intentType: "full_auto_publish",
        topic: "Kesalahan skincare remaja",
        brief: "Edukasi singkat tentang kesalahan skincare remaja.",
        platform: "Instagram",
        outputFormat: "Carousel foto",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — Agentic Chief v3 maturity-driven dispatch
// ---------------------------------------------------------------------------
//
// These tests cover the same conceptual scenarios as the v2 suite but assert
// against the v3 contract defined in
// `.kiro/specs/agentic-chief-v3/{requirements,design}.md`:
//
// * Decision variants: `director_text`, `ask_user_input`,
//   `open_cancellation_window`, `cancel_window_acknowledged`,
//   `ready_for_story`. The legacy `create_task` / `publish_gate` / `text`
//   variants are no longer produced (Inngest owns enqueue per task 7.2).
// * The `briefMaturity` 0..5 gate drives every dispatch (design Property 1).
// * Marker-based dispatch — confirmations are identified by `kind`
//   markers, never by regex on the question text (Requirement 8.1, 8.3, 8.4).
// * Topic capture — exploratory free-text only sets `topicCandidate`;
//   imperatives like "bikin carousel tentang X" promote to `confirmedTopic`
//   (Requirement 10.1, 10.4, 10.5).
// ---------------------------------------------------------------------------

describe("chief scope router — Agentic Chief v3", () => {
  it("treats vague content intent as natural briefing, not topic or task", () => {
    const decision = resolveChiefIntakeDecision([
      userText("yaudah deh gua pengen bikin konten"),
    ]);

    expect(decision.type).toBe("director_text");
    expect(decision.state.platform).toBe("instagram");
    expect(decision.state.topic).toBeUndefined();
    expect(decision.state.phase).toBe("gathering_context");
  });

  it("treats category-only answers as direction, not a confirmed topic", () => {
    const decision = resolveChiefIntakeDecision([
      userText("pengen bikin konten"),
      userText("edukasi bro"),
    ]);

    // v3 stays at maturity 2 (a topic candidate is parked from the goal-only
    // answer) but the topic is NEVER promoted to `confirmedTopic` without an
    // imperative or a wizard re-affirmation (Requirement 10.1, 10.5). The
    // legacy `state.topic` alias mirrors `confirmedTopic` only.
    expect(decision.type).toBe("ask_user_input");
    expect(decision.state.topic).toBeUndefined();
    expect(decision.state.ledger.confirmedTopic ?? null).toBeNull();
    expect(decision.state.goal).toBe("edukasi");
    expect(decision.state.ledger.goal).toBe("edukasi");
    expect(decision.state.readyForConfirmation).toBe(false);
  });

  it("accepts a concrete topic candidate but keeps briefing open", () => {
    const decision = resolveChiefIntakeDecision([
      userText("pengen bikin konten"),
      userText("burger lokal"),
    ]);

    // Non-imperative free-text "burger lokal" only sets `topicCandidate`
    // (Requirement 10.1). `confirmedTopic` and the legacy `state.topic`
    // alias must stay empty so the gate cannot accidentally promote to
    // level 3 (Requirement 10.5).
    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("wizard_topic");
    }
    expect(decision.state.topic).toBeUndefined();
    expect(decision.state.ledger.topicCandidate).toBe("Burger lokal");
    expect(decision.state.ledger.confirmedTopic ?? null).toBeNull();
    expect(decision.state.briefMaturity).toBe(2);
    expect(decision.state.readyForConfirmation).toBe(false);
  });

  it("does not ask confirmation until topic, goal, format, and visual source are ready", () => {
    const decision = resolveChiefIntakeDecision([
      userText("bikin carousel edukasi tentang kesalahan skincare remaja"),
    ]);

    // Imperative "bikin carousel ... tentang X" sets `confirmedTopic`
    // directly (Requirement 10.4). With topic + goal + format + platform
    // resolved but visualSource still missing, the gate stays at level 2 and
    // emits the visual wizard.
    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("wizard_visual");
    }
    expect(decision.state.briefMaturity).toBe(2);
    expect(decision.state.topic).toBe("Kesalahan skincare remaja");
    expect(decision.state.ledger.confirmedTopic).toBe(
      "Kesalahan skincare remaja",
    );
    expect(decision.state.format).toBe("instagram_carousel_photo");
    expect(decision.state.ledger.format).toBe("instagram_carousel_photo");
    expect(decision.state.ledger.goal).toBe("edukasi");
    expect(decision.state.visualSource).toBeUndefined();
  });

  it("asks confirmation after a mature Instagram brief has visual source", () => {
    const decision = resolveChiefIntakeDecision([
      userText("bikin carousel edukasi tentang kesalahan skincare remaja"),
      userText("carikan gambar dari internet"),
    ]);

    // All required slots filled → maturity 3 → Confirm_Card_Rich emission.
    // Phase remains the v3 enum value `"awaiting_confirmation"`.
    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("confirm_brief");
      expect(payload.pendingConfirmationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
    expect(decision.state.briefMaturity).toBe(3);
    expect(decision.state.phase).toBe("awaiting_confirmation");
    expect(decision.state.readyForConfirmation).toBe(true);
  });

  it("does not let a plain lanjut create a task without pending confirmation", () => {
    const decision = resolveChiefIntakeDecision([userText("lanjut")]);

    // Free-text "lanjut" no longer flips `state.confirmed` outside of an
    // active `pendingConfirmation` snapshot (Requirement 8.4, 8.5).
    expect(decision.type).toBe("director_text");
    expect(decision.state.confirmed).toBe(false);
    expect(decision.state.hasPendingConfirmation).toBe(false);
  });

  it("opens the cancellation window after a pending brief confirmation is approved", () => {
    const decision = resolveChiefIntakeDecision({
      messages: [
        userText("bikin carousel edukasi tentang kesalahan skincare remaja"),
        userText("carikan gambar dari internet"),
        assistantConfirmation(),
        toolAnswerWithMarker(
          "Konfirmasi brief",
          "Konfirmasi & mulai publish",
          "confirm_brief",
        ),
      ],
      // Hydrate the persisted snapshot — the v3 router only enters
      // maturity 4 when an active `pendingConfirmation` is on the ledger
      // (Requirement 7.1, 7.6).
      persistedLedger: persistedSkincareLedger(),
    });

    // Inngest now owns enqueue (Requirement 5, task 7.2). The router emits
    // `open_cancellation_window` instead of `create_task`. The window is
    // armed for 30 seconds and identified by the same `confirmationId` the
    // user saw on the Confirm_Card_Rich (Requirement 5.1, 7.4).
    expect(decision.type).toBe("open_cancellation_window");
    if (decision.type === "open_cancellation_window") {
      expect(decision.confirmationId).toBe(TEST_PENDING_CONFIRMATION_ID);
      expect(Number.isNaN(Date.parse(decision.scheduledExecuteAt))).toBe(false);
    }
    expect(decision.state.briefMaturity).toBe(4);
    expect(decision.state.confirmed).toBe(true);
    expect(decision.state.ledger.pendingTaskExecution?.confirmationId).toBe(
      TEST_PENDING_CONFIRMATION_ID,
    );
    expect(decision.state.ledger.pendingTaskExecution?.cancelled).toBe(false);
  });

  it("routes correction back to briefing, not into the cancellation window", () => {
    const decision = resolveChiefIntakeDecision({
      messages: [
        userText("bikin carousel edukasi tentang kesalahan skincare remaja"),
        userText("carikan gambar dari internet"),
        assistantConfirmation(),
        toolAnswerWithMarker("Konfirmasi brief", "Ubah dulu", "correction"),
      ],
      persistedLedger: persistedSkincareLedger(),
    });

    // v3 correction marker (Requirement 9.1, 9.4d): when the user clicks
    // "Ubah dulu" we drop the active `pendingConfirmation` snapshot and any
    // armed `pendingTaskExecution`, capture the displaced `confirmationId`
    // on `state.replacedConfirmationId` so the chief-chat endpoint
    // (task 8.1) can mark the legacy idempotency row `cancelled_at`, and
    // emit a director_text that asks the user which part they want to
    // change. Slots that were already valid stay on the ledger
    // (Requirement 1.9, 9.1) so the next emission can re-snapshot a fresh
    // `c_new` once the user describes their update.
    expect(decision.type).toBe("director_text");
    expect(decision.state.confirmed).toBe(false);
    expect(decision.state.correctionRequested).toBe(true);
    expect(decision.state.ledger.pendingConfirmation).toBeNull();
    expect(decision.state.ledger.pendingTaskExecution).toBeNull();
    expect(decision.state.replacedConfirmationId).toBe(
      TEST_PENDING_CONFIRMATION_ID,
    );
    // Slot-preservation invariant: every required slot the user already
    // confirmed survives the correction (Requirement 9.1).
    expect(decision.state.ledger.confirmedTopic).toBe(
      "Kesalahan skincare remaja",
    );
    expect(decision.state.ledger.format).toBeDefined();
    expect(decision.state.ledger.goal).toBe("edukasi");
    expect(decision.state.ledger.visualSource).toBe("internet_reference");
  });

  it("does not over-eager fire correction on free-text 'bukan' outside an active confirmation", () => {
    // Requirement 9.2, 9.3: words like "bukan"/"jangan"/"salah"/"ubah"/
    // "ganti" used in casual chat MUST NOT flip `correctionRequested` or
    // drop a (non-existent) pendingConfirmation. The message routes
    // through the standard director_text path so the LLM director can
    // re-parse the intent.
    const decision = resolveChiefIntakeDecision([
      userText("bukan, gua tadi salah ngomong"),
    ]);

    expect(decision.state.correctionRequested).toBe(false);
    expect(decision.state.ledger.pendingConfirmation).toBeNull();
    expect(decision.state.replacedConfirmationId).toBeUndefined();
  });

  it("keeps publish requests behind the deterministic gate", () => {
    const decision = resolveChiefIntakeDecision([
      userText("postingkan ke Instagram sekarang"),
    ]);

    // A bare publish request without a brief stays at maturity 1 with
    // `userIntent = "publish_request"` and emits a director_text follow-up.
    // Confirmation never bypasses the gate (Requirement 6.7).
    expect(decision.type).toBe("director_text");
    expect(decision.state.confirmed).toBe(false);
    expect(decision.state.ledger.userIntent).toBe("publish_request");
  });

  it("keeps unsupported platforms out of task creation", () => {
    const decision = resolveChiefIntakeDecision([userText("bikin TikTok")]);

    expect(decision.type).toBe("director_text");
    expect(decision.state.unsupportedPlatform).toBe("bikin TikTok");
  });
});

// ---------------------------------------------------------------------------
// Tests — Advisory marker handling (task 6.4)
//
// Validates that the advisory_continue / advisory_change markers route the
// dispatch correctly when goal/format conflicts are detected at maturity 3.
// The advisory layer NEVER blocks confirmation: the user can always confirm
// despite an open advisory note (Requirement 11.5).
//
// Validates: Requirements 11.3, 11.4, 11.5, 11.6, 11.7
// ---------------------------------------------------------------------------

describe("chief scope router — advisory marker handling (task 6.4)", () => {
  /**
   * Persisted ledger fixture with an active goal/format conflict
   * (Requirement 11.1): goal=engagement + format=instagram_feed_photo_caption.
   * `detectAdvisoryNotes` emits a `goal_format_conflict` note suggesting
   * `instagram_carousel_photo` so the gate at maturity 3 emits Limitations_Card
   * before Confirm_Card_Rich.
   */
  function persistedEngagementFeedLedger(): BriefLedger {
    return {
      userIntent: "content_creation_interest",
      platform: "instagram",
      format: "instagram_feed_photo_caption",
      topicCandidate: "Kesalahan skincare remaja",
      confirmedTopic: "Kesalahan skincare remaja",
      goal: "engagement",
      audience: null,
      workflowPreference: null,
      visualSource: "internet_reference",
      constraints: [],
      openQuestions: [],
      confidence: "high",
      briefMaturity: 3,
      advisoryNotes: [],
      pendingTaskExecution: null,
      pendingConfirmation: null,
    };
  }

  /**
   * Tool answer that round-trips an advisory marker (`advisory_continue` or
   * `advisory_change`). Mirrors the wire shape after the AI SDK transitions a
   * tool-askUserInput part from `input-available` to `output-available` for
   * Limitations_Card.
   */
  function advisoryToolAnswer(
    answer: "Mengerti, lanjut" | "Ganti pendekatan",
    marker: "advisory_continue" | "advisory_change",
  ): ChiefMessageLike {
    return {
      role: "assistant",
      parts: [
        {
          type: "tool-askUserInput",
          state: "output-available",
          input: {
            type: "single_select",
            kind: marker,
            questions: [
              {
                question: "Carousel mungkin lebih cocok untuk engagement",
                options: ["Mengerti, lanjut", "Ganti pendekatan"],
              },
            ],
          },
          output: {
            "Carousel mungkin lebih cocok untuk engagement": answer,
          },
        },
      ],
    };
  }

  it("emits Limitations_Card at maturity 3 when goal/format advisory exists", () => {
    // Baseline: ledger has the conflict; first encounter at maturity 3
    // surfaces the advisory before Confirm_Card_Rich (Requirement 11.3).
    const decision = resolveChiefIntakeDecision({
      messages: [userText("hmm")],
      persistedLedger: persistedEngagementFeedLedger(),
    });

    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("advisory_continue");
      expect(payload.questions[0].options).toEqual([
        "Mengerti, lanjut",
        "Ganti pendekatan",
      ]);
    }
    expect(decision.state.briefMaturity).toBe(3);
    expect(decision.state.ledger.advisoryNotes.length).toBeGreaterThan(0);
    expect(decision.state.ledger.advisoryNotes[0].kind).toBe(
      "goal_format_conflict",
    );
  });

  it("renders Confirm_Card_Rich after advisory_continue (Requirement 11.6)", () => {
    // After "Mengerti, lanjut", the gate falls through to Confirm_Card_Rich
    // even though the advisory note is still on the ledger. The user
    // explicitly chose to continue past the advisory.
    const decision = resolveChiefIntakeDecision({
      messages: [
        userText("hmm"),
        advisoryToolAnswer("Mengerti, lanjut", "advisory_continue"),
      ],
      persistedLedger: persistedEngagementFeedLedger(),
    });

    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("confirm_brief");
      expect(payload.questions[0].options).toEqual([
        "Konfirmasi & mulai publish",
        "Ubah dulu",
        "Batal",
      ]);
    }
    // The advisory is still detected on the ledger (the conflict is
    // unchanged) but advisoryAcknowledged short-circuits the
    // Limitations_Card emission (Requirement 11.5, 11.6).
    expect(decision.state.advisoryAcknowledged).toBe(true);
    expect(decision.state.ledger.advisoryNotes.length).toBeGreaterThan(0);
  });

  it("opens Wizard_Card targeting the conflicted slot after advisory_change (Requirement 11.7)", () => {
    // After "Ganti pendekatan" with a goal_format_conflict note targeting
    // `format`, the format slot is dropped so maturity falls to 2 and the
    // gate emits a wizard_format card. The wizard options include the
    // alternative Chief suggested ("Carousel foto" === instagram_carousel_photo).
    const decision = resolveChiefIntakeDecision({
      messages: [
        userText("hmm"),
        advisoryToolAnswer("Ganti pendekatan", "advisory_change"),
      ],
      persistedLedger: persistedEngagementFeedLedger(),
    });

    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("wizard_format");
      // Suggested alternative ("Carousel foto" → instagram_carousel_photo)
      // is surfaced in the options so the user can pick Chief's recommendation.
      expect(payload.questions[0].options).toContain("Carousel foto");
    }
    // The conflicting slot was dropped; non-conflicting slots are preserved
    // (Requirement 1.9, 11.7).
    expect(decision.state.briefMaturity).toBe(2);
    expect(decision.state.ledger.format).toBeUndefined();
    expect(decision.state.format).toBeUndefined();
    expect(decision.state.ledger.confirmedTopic).toBe(
      "Kesalahan skincare remaja",
    );
    expect(decision.state.ledger.goal).toBe("engagement");
    expect(decision.state.ledger.visualSource).toBe("internet_reference");
  });

  it("does not block 'Konfirmasi & mulai publish' when an advisory is active (Requirement 11.5)", () => {
    // Direct confirmation while advisory is still open: the user submits
    // confirm_brief without first acknowledging the advisory. The gate
    // MUST still arm the cancellation window — advisory is non-blocking.
    const ledger = persistedEngagementFeedLedger();
    ledger.pendingConfirmation = {
      confirmationId: TEST_PENDING_CONFIRMATION_ID,
      topic: "Kesalahan skincare remaja",
      platform: "instagram",
      format: "instagram_feed_photo_caption",
      goal: "engagement",
      audience: null,
      visualSource: "internet_reference",
      intentType: "full_auto_publish",
      output: "publish_to_instagram",
      publish: true,
      taskInput: {
        intentType: "full_auto_publish",
        topic: "Kesalahan skincare remaja",
        brief: "Edukasi singkat tentang kesalahan skincare remaja.",
        platform: "Instagram",
        outputFormat: "Feed foto + caption",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const decision = resolveChiefIntakeDecision({
      messages: [
        userText("bikin feed engagement tentang kesalahan skincare remaja"),
        userText("carikan gambar dari internet"),
        assistantConfirmation(),
        toolAnswerWithMarker(
          "Konfirmasi brief",
          "Konfirmasi & mulai publish",
          "confirm_brief",
        ),
      ],
      persistedLedger: ledger,
    });

    // Advisory is still on the ledger but does not block confirmation.
    expect(decision.type).toBe("open_cancellation_window");
    expect(decision.state.briefMaturity).toBe(4);
    expect(decision.state.ledger.advisoryNotes.length).toBeGreaterThan(0);
    expect(decision.state.ledger.pendingTaskExecution?.cancelled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — Honest unsupported platform handling (task 6.6)
//
// Validates that requests for YouTube/TikTok/LinkedIn/Blog/Threads/Facebook
// emit a director_text with at least one CONCRETE Instagram adaptation hint
// (Requirement 12.3), never emit `confirm_brief` (Requirement 12.4), and
// only escalate to a Limitations_Card on REPEATED requests (Requirement
// 12.5). The first mention always stays on natural director_text.
//
// Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
// ---------------------------------------------------------------------------

describe("chief scope router — honest unsupported platform handling (task 6.6)", () => {
  it("emits director_text with a concrete Instagram adaptation hint for TikTok (Requirement 12.1, 12.3)", () => {
    const decision = resolveChiefIntakeDecision([userText("bikin TikTok")]);

    expect(decision.type).toBe("director_text");
    if (decision.type === "director_text") {
      // Concrete adaptation hint MUST appear in both the LLM director
      // instruction and the static fallback so we never lose the hint
      // when the LLM is unavailable (Requirement 12.3).
      expect(decision.fallbackText).toContain("Carousel");
      expect(decision.fallbackText.toLowerCase()).toContain("instagram");
      expect(decision.instruction).toContain("Reels");
    }
    // Backward-compat: state.unsupportedPlatform still captures the raw
    // user text so legacy consumers (tests, observability) can read it.
    expect(decision.state.unsupportedPlatform).toBe("bikin TikTok");
  });

  it.each([
    ["bikin YouTube long video", "YouTube"],
    ["post LinkedIn buat audiens profesional", "LinkedIn"],
    ["mau bikin Threads", "Threads"],
    ["nulis blog tentang skincare", "Blog"],
    ["post Facebook", "Facebook"],
  ])(
    "emits director_text with adaptation hint for %s (Requirement 12.3)",
    (text, expectedPlatformLabel) => {
      const decision = resolveChiefIntakeDecision([userText(text)]);

      expect(decision.type).toBe("director_text");
      if (decision.type === "director_text") {
        // Every supported unsupported platform produces a hint that
        // names a specific Instagram format.
        expect(decision.fallbackText.toLowerCase()).toContain("instagram");
        const fallback = decision.fallbackText.toLowerCase();
        const containsConcreteFormat =
          fallback.includes("carousel") || fallback.includes("feed foto");
        expect(containsConcreteFormat).toBe(true);
      }
      expect(decision.state.unsupportedPlatform).toBe(text);
      // Sanity: the platform label is used by the helper but we don't
      // assert the exact body because copy may evolve.
      expect(expectedPlatformLabel.length).toBeGreaterThan(0);
    },
  );

  it("never emits confirm_brief for an unsupported platform request (Requirement 12.4)", () => {
    // Even with strong content-creation framing, the gate stays on
    // director_text and never opens Confirm_Card_Rich.
    const decision = resolveChiefIntakeDecision([
      userText("bikin TikTok edukasi tentang kesalahan skincare remaja"),
    ]);

    expect(decision.type).not.toBe("open_cancellation_window");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).not.toBe("confirm_brief");
    }
    expect(decision.state.ledger.pendingConfirmation).toBeNull();
    expect(decision.state.ledger.pendingTaskExecution).toBeNull();
  });

  it("escalates to a Limitations_Card on a repeated unsupported platform request (Requirement 12.5)", () => {
    // First request → director_text. Second request for a still-unsupported
    // platform → Limitations_Card with `advisory_*` markers and the
    // adaptation hint pre-filled. The card never carries `confirm_brief`
    // (Requirement 12.4).
    const decision = resolveChiefIntakeDecision([
      userText("bikin TikTok"),
      userText("ya pokoknya TikTok aja deh"),
    ]);

    expect(decision.type).toBe("ask_user_input");
    if (decision.type === "ask_user_input") {
      const payload = decision.payload as AskUserInputPayloadV3;
      expect(payload.kind).toBe("advisory_continue");
      expect(payload.kind).not.toBe("confirm_brief");
      expect(payload.questions[0].options).toEqual([
        "Mengerti, lanjut",
        "Ganti pendekatan",
      ]);
      expect(payload.message ?? "").toContain("TikTok");
      expect((payload.message ?? "").toLowerCase()).toContain("instagram");
    }
  });

  it("stays on director_text for the first unsupported platform request (Requirement 12.5 default)", () => {
    // Single mention is NEVER promoted to a kartu kaku; the v3 default
    // is natural-text honesty.
    const decision = resolveChiefIntakeDecision([
      userText("nulis blog tentang produk baru"),
    ]);

    expect(decision.type).toBe("director_text");
  });
});

// ---------------------------------------------------------------------------
// task 8.4 — task_failed emission for non-retryable enqueue failures
// ---------------------------------------------------------------------------

describe("chief scope router — task_failed emission (task 8.4)", () => {
  /**
   * Build a persisted ledger whose `pendingTaskExecution` carries a
   * non-retryable failure status. Mirrors what the Inngest handler
   * `chiefExecuteConfirmation` writes through `markConfirmationFailed`
   * after `enqueueAgenTeamTask` throws or returns `rate_limited`.
   *
   * The scheduled time is in the past so `determineBriefMaturity` would
   * naturally drop out of level 4; the failure short-circuit MUST fire
   * BEFORE the maturity switch so the user sees the error card instead
   * of being re-routed back to Confirm_Card_Rich (Requirement 13.6).
   */
  function failedLedger(args: {
    failureStatus: "error" | "rate_limited";
    failureMessage: string | null;
  }): BriefLedger {
    const base = persistedSkincareLedger();
    const failedAt = new Date(Date.now() - 1_000).toISOString();
    return {
      ...base,
      pendingTaskExecution: {
        confirmationId: TEST_PENDING_CONFIRMATION_ID,
        scheduledExecuteAt: new Date(Date.now() - 30_000).toISOString(),
        cancelled: false,
        cancelledAt: null,
        enqueuedAt: null,
        failureStatus: args.failureStatus,
        failedAt,
        failureMessage: args.failureMessage,
      },
    };
  }

  it("emits task_failed with status=error when persisted ledger carries a non-retryable failure", () => {
    const decision = resolveChiefIntakeDecision({
      messages: [userText("ada update?")],
      persistedLedger: failedLedger({
        failureStatus: "error",
        failureMessage: "Postgres unique constraint violation",
      }),
    });

    expect(decision.type).toBe("task_failed");
    if (decision.type === "task_failed") {
      expect(decision.failureStatus).toBe("error");
      expect(decision.confirmationId).toBe(TEST_PENDING_CONFIRMATION_ID);
      expect(decision.failureMessage).toBe(
        "Postgres unique constraint violation",
      );
    }
  });

  it("emits task_failed with status=rate_limited when the user is throttled", () => {
    const decision = resolveChiefIntakeDecision({
      messages: [userText("status?")],
      persistedLedger: failedLedger({
        failureStatus: "rate_limited",
        failureMessage: null,
      }),
    });

    expect(decision.type).toBe("task_failed");
    if (decision.type === "task_failed") {
      expect(decision.failureStatus).toBe("rate_limited");
      expect(decision.failureMessage).toBeNull();
    }
  });

  it("does NOT emit task_failed once the row is cancelled (cancellation wins over failure)", () => {
    // The cancellation path should be terminal — even if a failure flag
    // somehow survived, a cancelled window must not surface as an error
    // card to the user.
    const ledger = failedLedger({
      failureStatus: "error",
      failureMessage: "stale",
    });
    if (ledger.pendingTaskExecution) {
      ledger.pendingTaskExecution.cancelled = true;
      ledger.pendingTaskExecution.cancelledAt = new Date().toISOString();
    }

    const decision = resolveChiefIntakeDecision({
      messages: [userText("status?")],
      persistedLedger: ledger,
    });

    expect(decision.type).not.toBe("task_failed");
  });

  it("does NOT emit task_failed once the row is enqueued (success wins over failure)", () => {
    // Defensive: if both `enqueuedAt` and `failureStatus` are set (a DB
    // invariant violation that should never happen in practice), the
    // success path takes priority — the task IS in the pipeline.
    const ledger = failedLedger({
      failureStatus: "error",
      failureMessage: "stale",
    });
    if (ledger.pendingTaskExecution) {
      ledger.pendingTaskExecution.enqueuedAt = new Date().toISOString();
    }

    const decision = resolveChiefIntakeDecision({
      messages: [userText("status?")],
      persistedLedger: ledger,
    });

    expect(decision.type).not.toBe("task_failed");
  });
});
