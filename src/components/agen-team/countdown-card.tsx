"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "lib/utils";

/**
 * `CountdownCard` renders the 30-second cancellation window for a Chief
 * Chat v3 confirmation. It is mounted by `chat-bot.tsx` (mode
 * `agen-team-chief`, see task 11.1) when a tool output of
 * `agenTeamCancellationWindow` arrives with `status: "armed"` (Requirement
 * 5.3, 13.4). The component is intentionally standalone so that the
 * Interactive_Overlay system and the chat surface can dispatch it from
 * either tool-output stream without coupling the two.
 *
 * Behavioural contract (Requirements 5.3, 5.6, 5.9, 13.4, NFR8):
 * - Computes `secondsLeft = max(0, ceil((scheduledExecuteAt - now) / 1000))`
 *   on mount and decrements once per second via a single
 *   `setInterval(_, 1000)` so the component never polls the backend just
 *   to update the countdown (NFR8).
 * - Renders a progress bar reflecting `secondsLeft / durationSeconds` and
 *   the label `"Membatalkan dalam X detik akan menghentikan publish"`.
 * - The "Batalkan publish" button POSTs to
 *   `/api/agen-team/chief-chat/cancel` with `{ confirmationId }`. Once the
 *   request is in flight, or once the local state transitions to
 *   `cancelled` / `enqueued`, the button is disabled so a double-click can
 *   not double-fire (Requirement 5.7).
 * - Server is the authoritative trigger: when `secondsLeft` reaches 0 the
 *   component does NOT call enqueue itself. The parent (chat-bot,
 *   tasks 11.1 / 11.2) is responsible for polling
 *   `/api/agen-team/chief-chat/confirmation-status` to detect transition
 *   to `enqueued`. The countdown card only reflects state.
 * - `status === "cancelled"` renders a "Publish dibatalkan" message.
 * - `status === "enqueued"` (or `secondsLeft <= 0` while still armed)
 *   renders a "Publish dimulai" message.
 *
 * Resilience:
 * - Invalid `scheduledExecuteAt` falls back to `secondsLeft = 0` and the
 *   cancel button is disabled so the user is never blocked on parsing.
 * - The cancel POST is guarded by an `isCancelling` ref-backed state so a
 *   rapid double-click only fires once (Requirement 5.7).
 *
 * Accessibility:
 * - The label and seconds remaining live in an `aria-live="polite"` region
 *   so assistive tech announces the countdown without stealing focus.
 * - The cancel control is a real `<button type="button">` with an
 *   `aria-label` consistent with its visible label.
 */
export interface CountdownCardProps {
  /** Stable id of the pending confirmation (idempotency token). */
  confirmationId: string;
  /** ISO datetime when the backend will fire enqueue. */
  scheduledExecuteAt: string;
  /** Always `30` for v3; kept as a prop for forward compatibility. */
  durationSeconds: number;
  /** Current authoritative status from the latest tool output. */
  status: "armed" | "cancelled" | "enqueued";
  /**
   * Optional callback fired after the cancel POST resolves successfully.
   * Lets the parent dispatch a UI-side state update (e.g. close the card)
   * before the next tool output arrives.
   */
  onCancelled?: () => void;
}

/**
 * Compute the integer seconds remaining until `scheduledExecuteAt`.
 * Returns `0` if the timestamp is invalid or already in the past so the
 * UI degrades gracefully (Requirement 5.9 + resilience guidance).
 */
function computeSecondsLeft(
  scheduledExecuteAt: string,
  now: number,
): number {
  const target = Date.parse(scheduledExecuteAt);
  if (Number.isNaN(target)) return 0;
  const diffMs = target - now;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 1000);
}

export function CountdownCard({
  confirmationId,
  scheduledExecuteAt,
  durationSeconds,
  status,
  onCancelled,
}: CountdownCardProps) {
  const isInvalidSchedule = useMemo(
    () => Number.isNaN(Date.parse(scheduledExecuteAt)),
    [scheduledExecuteAt],
  );

  const [secondsLeft, setSecondsLeft] = useState(() =>
    computeSecondsLeft(scheduledExecuteAt, Date.now()),
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [localStatus, setLocalStatus] = useState<
    "armed" | "cancelled" | "enqueued"
  >(status);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep local status in sync if the parent pushes an updated tool output.
  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  // Single 1Hz tick. We intentionally do not depend on `secondsLeft` so the
  // interval is created exactly once per `scheduledExecuteAt` change and we
  // never burst the backend with polling (NFR8).
  useEffect(() => {
    if (localStatus !== "armed") return;
    if (isInvalidSchedule) return;

    setSecondsLeft(computeSecondsLeft(scheduledExecuteAt, Date.now()));

    const interval = window.setInterval(() => {
      setSecondsLeft(computeSecondsLeft(scheduledExecuteAt, Date.now()));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [scheduledExecuteAt, localStatus, isInvalidSchedule]);

  // Guard double-fire of the cancel POST even faster than React state can
  // settle by tracking the in-flight request via a ref.
  const inFlightRef = useRef(false);

  const handleCancel = useCallback(async () => {
    if (inFlightRef.current) return;
    if (localStatus !== "armed") return;
    if (isInvalidSchedule) return;

    inFlightRef.current = true;
    setIsCancelling(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/agen-team/chief-chat/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationId }),
      });

      if (!response.ok) {
        // 410 from legacy gate, or transient server error. Surface a quiet
        // message; the authoritative status will arrive via the next tool
        // output stream and overwrite local state if needed.
        setErrorMessage("Gagal membatalkan publish. Coba lagi sebentar.");
        return;
      }

      setLocalStatus("cancelled");
      onCancelled?.();
    } catch {
      setErrorMessage("Gagal membatalkan publish. Coba lagi sebentar.");
    } finally {
      inFlightRef.current = false;
      setIsCancelling(false);
    }
  }, [confirmationId, isInvalidSchedule, localStatus, onCancelled]);

  const safeDuration = durationSeconds > 0 ? durationSeconds : 30;
  const clampedSeconds = Math.max(0, Math.min(safeDuration, secondsLeft));
  const progressPercent = Math.max(
    0,
    Math.min(100, (clampedSeconds / safeDuration) * 100),
  );

  const isEnqueued = localStatus === "enqueued";
  const isCancelled = localStatus === "cancelled";
  const isExpired =
    localStatus === "armed" && (clampedSeconds <= 0 || isInvalidSchedule);

  const buttonDisabled =
    isCancelled || isEnqueued || isExpired || isCancelling || isInvalidSchedule;

  return (
    <div
      data-testid="countdown-card"
      data-status={localStatus}
      className="rounded-2xl border bg-background/80 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">Publish Instagram</p>
            <p
              data-testid="countdown-card-label"
              aria-live="polite"
              className="text-muted-foreground text-xs mt-1"
            >
              {isCancelled
                ? "Publish dibatalkan."
                : isEnqueued
                  ? "Publish dimulai."
                  : isExpired
                    ? "Publish dimulai."
                    : `Membatalkan dalam ${clampedSeconds} detik akan menghentikan publish`}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCancel()}
            disabled={buttonDisabled}
            aria-label="Batalkan publish"
            data-testid="countdown-card-cancel"
          >
            {isCancelling ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Membatalkan
              </>
            ) : (
              "Batalkan publish"
            )}
          </Button>
        </div>

        {/* Progress bar — purely presentational, mirrors `secondsLeft`. */}
        <div
          role="progressbar"
          aria-label="Sisa waktu cancellation window"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={clampedSeconds}
          data-testid="countdown-card-progress"
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full bg-foreground transition-all duration-1000 ease-linear",
              isCancelled || isEnqueued || isExpired ? "opacity-50" : "",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {errorMessage ? (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
