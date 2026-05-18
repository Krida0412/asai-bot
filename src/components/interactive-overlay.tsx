import { useState, useEffect, useRef } from "react";
import { Check, ArrowRight, GripVertical } from "lucide-react";
import { Input } from "ui/input";
import type { Marker } from "lib/agen-team/chief/markers";
import {
  LimitationsCard,
  type LimitationsCardData,
} from "@/components/agen-team/limitations-card";

/**
 * Free-text payload shape sent back to the server when the user submits a
 * free-text answer from a Chief Chat v3 interactive card. The router
 * dispatches based on `kind` (and optional `pendingConfirmationId`) without
 * any regex on the question text — see Requirements 4.6, 4.7, 4.8, 4.9 and
 * 8.1, 8.3.
 */
export type InteractiveOverlayFreeTextAnswer = {
  kind: Marker;
  pendingConfirmationId?: string;
  answer: string;
};

interface InteractiveOverlayProps {
  data: {
    type: "single_select" | "multi_select" | "rank_priorities";
    message?: string;
    questions: {
      question: string;
      options: string[];
    }[];
    /**
     * Chief Chat v3 — explicit marker that identifies the card kind so the
     * server can route the answer (Requirement 8.1). Only set by
     * `Scope_Router`; other modes leave it undefined and therefore never
     * render the free-text input (NFR6).
     */
    kind?: Marker;
    /**
     * Chief Chat v3 — UUID v4 binding the card to a specific
     * `pendingConfirmation` snapshot so confirmation/correction/cancel
     * answers route to the right idempotency row (Requirement 4.6, 8.2).
     */
    pendingConfirmationId?: string;
    /**
     * Chief Chat v3 — when `true` (default) and `kind` is one of the
     * free-text-enabled kinds, the overlay renders a free-text input below
     * the option buttons so users can type their own answer (Requirement
     * 3.3, 4.5).
     */
    allowFreeText?: boolean;
    /** Optional placeholder hint for the free-text input. */
    freeTextPlaceholder?: string;
  };
  toolCallId: string;
  onDismiss: () => void;
  onSubmit: (
    toolCallId: string,
    answer: Record<string, string | string[]> | InteractiveOverlayFreeTextAnswer,
  ) => void;
}

/**
 * Returns true when the card kind accepts a free-text answer (Chief Chat v3
 * wizard slots, Confirm_Card_Rich, and correction prompts). Other kinds —
 * including the unset-kind case used by every non-Chief mode — return
 * false, naturally gating free-text rendering to `agen-team-chief` only
 * (Requirement NFR6).
 */
function supportsFreeTextKind(kind: Marker | undefined): kind is Marker {
  if (!kind) return false;
  if (kind === "confirm_brief" || kind === "correction") return true;
  return kind.startsWith("wizard_");
}

export function InteractiveOverlay({
  data,
  toolCallId,
  onDismiss,
  onSubmit,
}: InteractiveOverlayProps) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draggedItem, setDraggedItem] = useState<{
    qIndex: number;
    option: string;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  /**
   * Chief Chat v3 — local draft of the free-text answer for the currently
   * displayed question. Reset whenever the wizard advances to the next
   * question so per-question free-text input does not leak across slots.
   */
  const [freeText, setFreeText] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Transform animation — translateY only
  useEffect(() => {
    if (!modalRef.current) return;
    modalRef.current.style.transform = isVisible
      ? "translateY(0)"
      : "translateY(100%)";
    const handleResize = () => {
      if (!modalRef.current) return;
      modalRef.current.style.transform = isVisible
        ? "translateY(0)"
        : "translateY(100%)";
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isVisible]);

  // ESC key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Chief Chat v3 — clear the free-text draft whenever the wizard advances
   * to a new question so the previous slot's answer does not bleed into the
   * next one. Confirm_Card_Rich and correction cards always use index 0,
   * so this is effectively a per-slot reset.
   */
  useEffect(() => {
    setFreeText("");
  }, [currentIndex]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 150);
  };

  const isRanking = data.type === "rank_priorities";
  const isSingle = data.type === "single_select";

  /**
   * Chief Chat v3 — Free-text rendering is gated on three conditions
   * (Requirements 3.3, 4.5, NFR6):
   *   1. `kind` is set (only Chief Chat v3 emits markers; other modes
   *      never set `kind`, so free-text stays hidden for them).
   *   2. The marker is one of the free-text-enabled kinds (wizard slots,
   *      Confirm_Card_Rich, correction).
   *   3. `allowFreeText` is not explicitly set to `false` (default true).
   *   4. The card is not `rank_priorities` (ranking has its own UX).
   */
  const isFreeTextEnabled =
    !isRanking &&
    supportsFreeTextKind(data.kind) &&
    data.allowFreeText !== false;

  const freeTextPlaceholder =
    data.freeTextPlaceholder ?? "Atau ketik jawaban kamu sendiri…";

  /**
   * Submit the raw free-text string to the server. The client does NOT
   * parse the answer — the server-side `Slot_Detector` handles all
   * heuristics (Requirement 3.6, 3.7). The marker (`kind`) and
   * `pendingConfirmationId` are echoed back so `Scope_Router` can dispatch
   * the answer without regex on the question text (Requirement 8.1, 8.3).
   */
  function handleFreeTextSubmit() {
    const trimmed = freeText.trim();
    if (!trimmed || !isFreeTextEnabled || !data.kind) return;
    onSubmit(toolCallId, {
      kind: data.kind,
      pendingConfirmationId: data.pendingConfirmationId,
      answer: trimmed,
    });
  }

  const validQuestions = data.questions.filter(
    (q) => q.question?.trim() && q.options && q.options.length > 0,
  );

  if (validQuestions.length === 0) return null;

  /**
   * Chief Chat v3 — when the server marks the card as an advisory
   * (`advisory_continue` / `advisory_change`), short-circuit to
   * `LimitationsCard` instead of the regular wizard/confirm rendering
   * (Requirements 11.3, 11.4, 12.5). Placed after all hooks so React's
   * hook order stays stable; `data.kind` does not change for a given
   * `toolCallId` so the early return is effectively static per render
   * tree.
   */
  if (
    data.kind === "advisory_continue" ||
    data.kind === "advisory_change"
  ) {
    return (
      <LimitationsCard
        data={data as LimitationsCardData}
        toolCallId={toolCallId}
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />
    );
  }

  function toggle(qIndex: number, option: string) {
    if (isRanking) return;

    if (isSingle) {
      const newSelected = { ...selected, [qIndex]: [option] };
      setSelected(newSelected);

      // Auto-advance or submit for single_select
      setTimeout(() => {
        if (currentIndex < validQuestions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else if (Object.keys(newSelected).length === validQuestions.length) {
          const payload: Record<string, string | string[]> = {};
          validQuestions.forEach((q, i) => {
            payload[q.question] = newSelected[i]?.[0] ?? "";
          });
          onSubmit(toolCallId, payload);
        }
      }, 300); // give a slight delay for user to see checkmark before moving to next
      return;
    }

    setSelected((prev) => {
      const current = prev[qIndex] || [];
      return {
        ...prev,
        [qIndex]: current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option],
      };
    });
  }

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    qIndex: number,
    option: string,
  ) => {
    setDraggedItem({ qIndex, option });
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      (e.target as HTMLElement).classList.add("opacity-50");
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    setDraggedItem(null);
    (e.target as HTMLElement).classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    qIndex: number,
    targetOption: string,
    options: string[],
  ) => {
    e.preventDefault();
    if (
      !draggedItem ||
      draggedItem.qIndex !== qIndex ||
      draggedItem.option === targetOption
    )
      return;

    const currentOrder =
      selected[qIndex]?.length === options.length
        ? selected[qIndex]
        : [...options];
    const draggedIdx = currentOrder.indexOf(draggedItem.option);
    const targetIdx = currentOrder.indexOf(targetOption);

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedItem.option);

    setSelected((prev) => ({ ...prev, [qIndex]: newOrder }));
  };

  function handleNextOrSubmit() {
    // Current answer for multi_select or rank_priorities
    const answer = selected[currentIndex] || [];
    if (isRanking && answer.length === 0) {
      setSelected((prev) => ({
        ...prev,
        [currentIndex]: [...validQuestions[currentIndex].options],
      }));
    }

    if (currentIndex < validQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      const payload: Record<string, string | string[]> = {};
      let hasAnsweredEverything = true;

      validQuestions.forEach((q, i) => {
        let finalAnswer = selected[i] || [];
        if (isRanking && finalAnswer.length === 0) {
          finalAnswer = [...q.options];
        }
        if (!isRanking && finalAnswer.length === 0) {
          hasAnsweredEverything = false;
        }
        payload[q.question] = isSingle ? (finalAnswer[0] ?? "") : finalAnswer;
      });

      if (!hasAnsweredEverything) return;
      onSubmit(toolCallId, payload);
    }
  }

  const answeredCount = Object.keys(selected).length;
  const currentQuestion = validQuestions[currentIndex];
  // Multi select must have at least one thing selected to move next (or rank)
  const isNextDisabled =
    !isRanking &&
    (!selected[currentIndex] || selected[currentIndex].length === 0);

  const currentOptions =
    isRanking &&
    selected[currentIndex]?.length === currentQuestion.options.length
      ? selected[currentIndex]
      : currentQuestion.options;

  return (
    <div
      data-testid="interactive-overlay"
      className="absolute inset-x-0 bottom-0 z-50 flex flex-col justify-end bg-black/45 transition-opacity duration-150 h-full"
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
      }}
      onClick={handleDismiss}
    >
      {/* Wrapper max-w-3xl mx-auto to constrain panel width to match chat messages */}
      <div className="w-full max-w-3xl mx-auto flex flex-col justify-end">
        <div
          ref={modalRef}
          className="bg-background border-t border-x border-border w-full rounded-t-2xl flex flex-col transition-transform duration-150"
          style={{ transform: "translateY(100%)", maxHeight: "75vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            className="w-full flex justify-center pt-3 pb-1 cursor-pointer"
            onClick={handleDismiss}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          <div className="flex flex-col overflow-y-auto">
            {/* Question title */}
            <div className="px-6 pt-4 pb-3">
              {data.message ? (
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  {data.message}
                </p>
              ) : null}
              <h2
                data-testid="interactive-overlay-question"
                className="text-xl font-medium text-foreground leading-snug"
              >
                {currentQuestion.question}
              </h2>
            </div>

            {/* Options */}
            <div className="flex flex-col px-3 pb-2">
              {currentOptions.map((option, i) => (
                <div
                  key={option}
                  data-testid={`interactive-option-${i}`}
                  onDragOver={isRanking ? handleDragOver : undefined}
                  onDrop={
                    isRanking
                      ? (e) =>
                          handleDrop(
                            e,
                            currentIndex,
                            option,
                            currentQuestion.options,
                          )
                      : undefined
                  }
                >
                  <div
                    draggable={isRanking}
                    onDragStart={
                      isRanking
                        ? (e) => handleDragStart(e, currentIndex, option)
                        : undefined
                    }
                    onDragEnd={isRanking ? handleDragEnd : undefined}
                    onClick={
                      !isRanking
                        ? () => toggle(currentIndex, option)
                        : undefined
                    }
                    className={`w-full flex items-center gap-3 px-3 py-4 text-left transition-colors cursor-pointer rounded-lg
                      ${
                        !isRanking && selected[currentIndex]?.includes(option)
                          ? "bg-muted"
                          : "hover:bg-muted/50"
                      }
                      ${isRanking ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    {/* Checkbox (not radio) */}
                    {!isRanking && (
                      <div
                        className={`border flex items-center justify-center flex-shrink-0 transition-all
                          ${
                            selected[currentIndex]?.includes(option)
                              ? "bg-foreground border-foreground"
                              : "border-border"
                          }`}
                        style={{
                          borderRadius: "4px",
                          minWidth: "20px",
                          width: "20px",
                          height: "20px",
                          minHeight: "20px",
                        }}
                      >
                        {selected[currentIndex]?.includes(option) && (
                          <Check
                            size={11}
                            strokeWidth={2.5}
                            className="text-background"
                          />
                        )}
                      </div>
                    )}

                    <span className="text-base break-words min-w-0 flex-1">
                      {isRanking && (
                        <span className="mr-3 text-muted-foreground">
                          {i + 1}.
                        </span>
                      )}
                      {option}
                    </span>

                    {isRanking && (
                      <div className="text-muted-foreground flex-shrink-0">
                        <GripVertical size={16} />
                      </div>
                    )}
                  </div>

                  {i < currentOptions.length - 1 && (
                    <div className="h-px bg-border mx-3" />
                  )}
                </div>
              ))}
            </div>

            {/* Chief Chat v3 — Free-text input.
                Rendered only when the card kind accepts a free-text answer
                (wizard slots, Confirm_Card_Rich, correction). Other modes
                never set `kind`, so the input stays hidden for them and
                their existing button-press behaviour is unchanged.
                Requirements: 3.3, 3.5, 3.6, 4.5, 4.7, 4.8, 4.9, NFR6. */}
            {isFreeTextEnabled && (
              <div className="px-6 pb-4 pt-1 flex flex-col gap-2">
                <label
                  htmlFor={`interactive-overlay-freetext-${toolCallId}`}
                  className="text-xs text-muted-foreground"
                >
                  Atau jawab dengan kalimatmu sendiri
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`interactive-overlay-freetext-${toolCallId}`}
                    data-testid="interactive-overlay-freetext"
                    type="text"
                    value={freeText}
                    placeholder={freeTextPlaceholder}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleFreeTextSubmit();
                      }
                    }}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    data-testid="interactive-overlay-freetext-submit"
                    disabled={!freeText.trim()}
                    onClick={handleFreeTextSubmit}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0
                      ${
                        freeText.trim()
                          ? "bg-foreground text-background hover:opacity-90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                    aria-label="Kirim jawaban"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border mt-auto">
            <span className="text-sm text-muted-foreground">
              {isRanking
                ? "Drag untuk mengurutkan"
                : `${answeredCount}/${validQuestions.length} terjawab`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDismiss}
                className="px-4 py-2 rounded-lg text-sm bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                Lewati
              </button>
              {(!isSingle || validQuestions.length > 1) && ( // show next/submit button if multi or single with multiple steps
                <button
                  disabled={isNextDisabled}
                  onClick={handleNextOrSubmit}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                    ${
                      !isNextDisabled
                        ? "bg-foreground text-background hover:opacity-90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    }`}
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
