/**
 * Chief Chat (Pak Arga) v3 — Marker Registry
 *
 * Markers are explicit `kind` tags attached to interactive overlay payloads
 * (`askUserInput.input` and tool answers) so that `Scope_Router` can
 * dispatch confirmations, wizard answers, corrections, and cancellation
 * actions WITHOUT relying on regex-matching the question copy.
 *
 * Adding a marker here is a code-level contract: any new marker MUST also be
 * handled by `resolveChiefIntakeDecision` in `scope-router.ts`. Markers that
 * do not appear in {@link KNOWN_MARKERS} are treated as plain free-text
 * messages by the router (Requirement 8.5).
 *
 * @see ../../../.kiro/specs/agentic-chief-v3/design.md "Marker yang dikenal"
 * @see ../../../.kiro/specs/agentic-chief-v3/requirements.md Requirement 8
 */

import { z } from "zod";

/**
 * Mapping of every supported marker to the context it is emitted from and
 * the effect it has on `Scope_Router`. Keep this comment block in sync with
 * the union below — it is the single human-readable source of truth.
 *
 * | Marker              | Trigger context                                                                | Effect on Scope_Router                                                                 |
 * | ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
 * | `wizard_platform`   | Wizard_Card slot platform                                                      | Parse answer into `ledger.platform`.                                                   |
 * | `wizard_format`     | Wizard_Card slot format                                                        | Parse answer into `ledger.format`.                                                     |
 * | `wizard_topic`      | Wizard_Card slot topic                                                         | Parse into `topicCandidate` (or `confirmedTopic` if explicit imperative).              |
 * | `wizard_goal`       | Wizard_Card slot goal                                                          | Parse into `ledger.goal` and append to `ledger.constraints`.                           |
 * | `wizard_visual`     | Wizard_Card slot visual source                                                 | Parse into `ledger.visualSource`.                                                      |
 * | `confirm_brief`     | Confirm_Card_Rich button "Konfirmasi & mulai publish" or yes-equivalent text   | Open the 30s cancellation window (transition to `briefMaturity = 4`).                  |
 * | `correction`        | Confirm_Card_Rich button "Ubah dulu" or free-text correction during confirm    | Drop pendingConfirmation, parse update, return to wizard / re-render Confirm_Card_Rich.|
 * | `cancel_brief`      | Confirm_Card_Rich button "Batal"                                               | Drop pendingConfirmation, emit director_text acknowledgement.                          |
 * | `cancel_window`     | Countdown card button "Batalkan publish"                                       | Mark pendingTaskExecution cancelled; never enqueue.                                    |
 * | `advisory_continue` | Advisory_Card / Limitations_Card button "Mengerti, lanjut"                     | Render Confirm_Card_Rich (advisory does not block confirmation).                       |
 * | `advisory_change`   | Advisory_Card / Limitations_Card button "Ganti pendekatan"                     | Open Wizard_Card for the conflicting slot with Chief's suggested alternatives.         |
 */
export type Marker =
  | "wizard_platform"
  | "wizard_format"
  | "wizard_topic"
  | "wizard_goal"
  | "wizard_visual"
  | "confirm_brief"
  | "correction"
  | "cancel_brief"
  | "cancel_window"
  | "advisory_continue"
  | "advisory_change";

/**
 * zod enum mirror of {@link Marker}. Use this as the single source of truth
 * when validating tool payloads at runtime (e.g. inside
 * `askUserInputTool.inputSchema`).
 */
export const ChiefMarkerSchema = z.enum([
  "wizard_platform",
  "wizard_format",
  "wizard_topic",
  "wizard_goal",
  "wizard_visual",
  "confirm_brief",
  "correction",
  "cancel_brief",
  "cancel_window",
  "advisory_continue",
  "advisory_change",
]);

/**
 * Runtime-validation set of every recognised marker. `Scope_Router` checks
 * incoming `tool_answer.kind` against this set; anything missing falls
 * through to the plain free-text path (Requirement 8.5).
 *
 * Typed as `ReadonlySet<Marker>` so callers cannot mutate the registry, and
 * so `KNOWN_MARKERS.has(value)` narrows `value` to `Marker` at the call site.
 */
export const KNOWN_MARKERS: ReadonlySet<Marker> = new Set<Marker>([
  "wizard_platform",
  "wizard_format",
  "wizard_topic",
  "wizard_goal",
  "wizard_visual",
  "confirm_brief",
  "correction",
  "cancel_brief",
  "cancel_window",
  "advisory_continue",
  "advisory_change",
]);

/**
 * Type guard for {@link Marker}. Useful when reading `kind` from an untrusted
 * payload (free-text JSON, legacy clients) before dispatching.
 */
export function isKnownMarker(value: unknown): value is Marker {
  return typeof value === "string" && KNOWN_MARKERS.has(value as Marker);
}
