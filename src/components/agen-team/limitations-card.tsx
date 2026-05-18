"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  InteractiveOverlayFreeTextAnswer,
} from "@/components/interactive-overlay";

/**
 * Chief Chat (Pak Arga) v3 — `Limitations_Card` / `Advisory_Card`
 *
 * Rendered by `InteractiveOverlay` whenever the server emits an
 * `askUserInput` payload with `kind ∈ {"advisory_continue",
 * "advisory_change"}` (Requirements 11.3, 11.4, 12.5).
 *
 * The card surfaces a single advisory note from
 * `Brief_Ledger.advisoryNotes` and lets the user pick between two
 * marker-tagged answers:
 *
 * - **"Mengerti, lanjut"** → submits `kind: "advisory_continue"`.
 *   `Scope_Router` (task 6.4) interprets this as "keep current brief and
 *   re-render Confirm_Card_Rich" (Requirement 11.6).
 * - **"Ganti pendekatan"** → submits `kind: "advisory_change"`.
 *   `Scope_Router` opens `Wizard_Card` for the conflicting slot with the
 *   alternatives Chief suggested (Requirement 11.7).
 *
 * The label/marker pairing is exact (Requirement 11.4) and is the contract
 * relied on by the property tests in `advisory.property.test.ts`.
 *
 * Visual contract (Requirement 11.4):
 * - Info icon at the top-left.
 * - Concise heading rendered as `<h3>` (uses
 *   `data.questions[0].question` if present, otherwise the fallback
 *   "Catatan dari Pak Arga").
 * - Body paragraph from `data.message` (the advisoryNote text).
 * - Two action buttons; both real `<button>` elements via `Button` from
 *   `@/components/ui/button` for consistent styling and a11y.
 *
 * The card does NOT render the standard option grid or the free-text
 * input — `InteractiveOverlay` short-circuits to this component before
 * any of that logic runs (Requirement NFR6 / single-responsibility).
 */

/**
 * Subset of `InteractiveOverlayProps['data']` that this card actually
 * consumes. Kept narrow so the component can be reused by alternate
 * dispatchers (e.g. limitations on platform — Requirement 12.5) without
 * pulling in unrelated wizard fields.
 */
export interface LimitationsCardData {
  /** Body text — typically the advisoryNote message. */
  message?: string;
  /**
   * The original `questions` array from the askUserInput payload. The
   * first entry's `question` is used as the card title; the options are
   * intentionally ignored because the card hard-codes its two buttons.
   */
  questions: Array<{ question: string; options: string[] }>;
  /** Marker indicating which advisory action the server scheduled. */
  kind: "advisory_continue" | "advisory_change";
  /**
   * UUID v4 binding the card to its `pendingConfirmation` snapshot — echoed
   * back so `Scope_Router` can route the answer without regex
   * (Requirement 8.2, 8.3).
   */
  pendingConfirmationId?: string;
}

export interface LimitationsCardProps {
  data: LimitationsCardData;
  toolCallId: string;
  onDismiss: () => void;
  onSubmit: (
    toolCallId: string,
    answer: InteractiveOverlayFreeTextAnswer,
  ) => void;
}

/** Default card title when the server does not supply one. */
const DEFAULT_TITLE = "Catatan dari Pak Arga";

/** Hard-coded button labels (Requirement 11.4 — exact strings). */
const CONTINUE_LABEL = "Mengerti, lanjut";
const CHANGE_LABEL = "Ganti pendekatan";

export function LimitationsCard({
  data,
  toolCallId,
  onDismiss,
  onSubmit,
}: LimitationsCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Enter animation, mirrors InteractiveOverlay so swap-in is seamless.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!modalRef.current) return;
    modalRef.current.style.transform = isVisible
      ? "translateY(0)"
      : "translateY(100%)";
  }, [isVisible]);

  // ESC key dismiss — same affordance as InteractiveOverlay.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 150);
  };

  /**
   * Submit the user's choice. The marker (`advisory_continue` /
   * `advisory_change`) is what `Scope_Router` keys off — the human-readable
   * `answer` is preserved for the agent log only (Requirement 8.1, 8.3).
   */
  function handleChoice(kind: "advisory_continue" | "advisory_change") {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onSubmit(toolCallId, {
      kind,
      pendingConfirmationId: data.pendingConfirmationId,
      answer: kind === "advisory_continue" ? CONTINUE_LABEL : CHANGE_LABEL,
    });
  }

  const title = data.questions[0]?.question?.trim() || DEFAULT_TITLE;
  const body = data.message?.trim() ?? "";

  return (
    <div
      data-testid="limitations-card-overlay"
      className="absolute inset-x-0 bottom-0 z-50 flex flex-col justify-end bg-black/45 transition-opacity duration-150 h-full"
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
      }}
      onClick={handleDismiss}
    >
      <div className="w-full max-w-3xl mx-auto flex flex-col justify-end">
        <div
          ref={modalRef}
          data-testid="limitations-card"
          data-kind={data.kind}
          className="bg-background border-t border-x border-border w-full rounded-t-2xl flex flex-col transition-transform duration-150"
          style={{ transform: "translateY(100%)", maxHeight: "75vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle — clicking dismisses, mirrors InteractiveOverlay. */}
          <div
            className="w-full flex justify-center pt-3 pb-1 cursor-pointer"
            onClick={handleDismiss}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          <div className="px-6 pt-4 pb-5 flex flex-col gap-4">
            {/* Title row: info icon + heading. */}
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 mt-0.5 rounded-full bg-muted/60 p-2"
                aria-hidden="true"
              >
                <Info size={18} className="text-foreground" />
              </div>
              <h3
                data-testid="limitations-card-title"
                className="text-lg font-medium text-foreground leading-snug"
              >
                {title}
              </h3>
            </div>

            {/* Body — advisoryNote text. */}
            {body ? (
              <p
                data-testid="limitations-card-body"
                className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line"
              >
                {body}
              </p>
            ) : null}
          </div>

          {/* Actions footer — two buttons mapped 1:1 to advisory markers. */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-6 py-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              data-testid="limitations-card-change"
              disabled={isSubmitting}
              onClick={() => handleChoice("advisory_change")}
            >
              {CHANGE_LABEL}
            </Button>
            <Button
              type="button"
              data-testid="limitations-card-continue"
              disabled={isSubmitting}
              onClick={() => handleChoice("advisory_continue")}
            >
              {CONTINUE_LABEL}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
