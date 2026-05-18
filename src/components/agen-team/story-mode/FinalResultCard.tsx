"use client";

import { Button } from "@/components/ui/button";
import { safeJSONParse } from "@/lib/utils";
import { motion } from "framer-motion";
import { useState } from "react";
import type { StageOutputLike, StoryItem } from "./types";

interface FinalResultCardProps {
  item: StoryItem;
  taskId?: string | null;
  onRetry?: (taskId: string) => void | Promise<void>;
  onApprove?: (taskId: string) => void | Promise<void>;
  onOpenResults?: () => void;
  delay?: number;
}

function parseContent(content: unknown) {
  if (typeof content === "string") {
    const parsed = safeJSONParse<Record<string, unknown>>(content);
    return parsed.success ? parsed.value : content;
  }

  return content;
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function getPublishRecord(output?: StageOutputLike | null) {
  if (!output) return null;
  if (output.stageName === "instagram_publish_result") {
    return readRecord(parseContent(output.content));
  }
  const content = readRecord(parseContent(output.content));
  if (
    typeof content.publicationUrl === "string" ||
    typeof content.permalink === "string" ||
    content.type === "instagram_publish_result" ||
    content.status === "published" ||
    content.status === "success" ||
    content.status === "failed_publish" ||
    content.status === "failed" ||
    content.status === "running" ||
    content.status === "processing"
  ) {
    return content;
  }
  return null;
}

function getPublishSummary(record: Record<string, unknown>) {
  const status = String(record.status ?? "");
  const url = String(record.publicationUrl ?? record.permalink ?? "").trim();
  const error = String(
    record.error ?? record.errorReason ?? record.reason ?? "",
  ).trim();
  const mediaId = String(record.mediaId ?? record.publicationId ?? "").trim();

  if (status === "published" || status === "success" || url) {
    return url
      ? `Upload Instagram berhasil. Link post: ${url}`
      : mediaId
        ? `Upload Instagram berhasil. Media ID: ${mediaId}`
        : "Upload Instagram berhasil. Instagram belum mengembalikan link publik.";
  }

  if (status === "running" || status === "processing") {
    return "Upload Instagram sedang diproses.";
  }

  return `Upload Instagram gagal${error ? `: ${error}` : "."}`;
}

function getSummary(output?: StageOutputLike | null) {
  if (!output) {
    return "Hasil belum siap ditampilkan.";
  }

  const publishRecord = getPublishRecord(output);
  if (publishRecord) {
    return getPublishSummary(publishRecord);
  }

  const content = parseContent(output.content);
  if (
    (output.stageName === "marketing" ||
      output.stageName === "marketing_draft") &&
    typeof content === "object" &&
    content
  ) {
    const text = String(
      (content as Record<string, unknown>).finalCopy ?? "",
    ).trim();
    return text.split(/\n+/)[0] || "Draft marketing sudah siap ditinjau.";
  }
  if (
    output.stageName === "intelligence" &&
    typeof content === "object" &&
    content
  ) {
    return (
      String(
        (content as Record<string, unknown>).executiveSummary ?? "",
      ).trim() || "Laporan intelijen sudah siap dibaca."
    );
  }
  if (
    output.stageName === "system_error" &&
    typeof content === "object" &&
    content
  ) {
    return String(
      (content as Record<string, unknown>).message ??
        "Task berhenti karena kendala sistem.",
    );
  }

  return "Hasil akhir task ini sudah siap ditinjau.";
}

function getReadableSource(output?: StageOutputLike | null) {
  if (!output) return "Ringkasan akhir";
  if (output.stageName === "instagram_publish_result")
    return "Hasil upload Instagram";
  if (output.stageName === "marketing") return "Versi marketing";
  if (output.stageName === "marketing_draft") return "Draft marketing";
  if (output.stageName === "intelligence") return "Laporan intelijen";
  if (output.stageName === "system_error") return "Catatan sistem";
  return "Ringkasan akhir";
}

function getReadableStatus(status: string) {
  const map: Record<string, string> = {
    completed: "Siap ditinjau",
    failed: "Perlu dicek ulang",
    running: "Masih berjalan",
    cancelled: "Dibatalkan",
  };

  return map[status] ?? status;
}

function getCopyContent(output?: StageOutputLike | null) {
  if (!output) return null;

  const publishRecord = getPublishRecord(output);
  if (publishRecord) {
    return [
      getPublishSummary(publishRecord),
      publishRecord.publicationUrl || publishRecord.permalink
        ? `Link: ${String(publishRecord.publicationUrl ?? publishRecord.permalink)}`
        : null,
      publishRecord.mediaId || publishRecord.publicationId
        ? `Media ID: ${String(publishRecord.mediaId ?? publishRecord.publicationId)}`
        : null,
      publishRecord.imageUrl
        ? `Visual: ${String(publishRecord.imageUrl)}`
        : null,
      publishRecord.caption
        ? `Caption:\n${String(publishRecord.caption)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const content = parseContent(output.content);
  if (
    (output.stageName === "marketing" ||
      output.stageName === "marketing_draft") &&
    typeof content === "object" &&
    content
  ) {
    return String((content as Record<string, unknown>).finalCopy ?? "").trim();
  }

  if (
    output.stageName === "intelligence" &&
    typeof content === "object" &&
    content
  ) {
    const record = content as Record<string, unknown>;
    const summary = String(record.executiveSummary ?? "").trim();
    const facts = Array.isArray(record.keyFacts)
      ? record.keyFacts
          .map((fact) => String(fact).trim())
          .filter(Boolean)
          .map((fact) => `- ${fact}`)
      : [];

    return [summary, facts.length > 0 ? facts.join("\n") : null]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  if (
    output.stageName === "system_error" &&
    typeof content === "object" &&
    content
  ) {
    return String((content as Record<string, unknown>).message ?? "").trim();
  }

  if (typeof content === "string") {
    return content.trim();
  }

  return null;
}

export function FinalResultCard({
  item,
  taskId,
  onRetry,
  onApprove,
  onOpenResults,
  delay = 0,
}: FinalResultCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const output =
    (item.meta?.output as StageOutputLike | null | undefined) ?? null;
  const storyFinalOutput =
    (item.meta?.finalOutput as Record<string, unknown> | null | undefined) ??
    ((item.meta?.storyEvent as { meta?: Record<string, unknown> } | undefined)
      ?.meta?.finalOutput as Record<string, unknown> | null | undefined) ??
    null;
  const outputs = (item.meta?.outputs as StageOutputLike[] | undefined) ?? [];
  const publishOutput =
    outputs.find((entry) => entry.stageName === "instagram_publish_result") ??
    null;
  const storyPublishOutput =
    storyFinalOutput?.type === "instagram_publish_result"
      ? storyFinalOutput
      : null;
  const displayOutput = publishOutput ?? output;
  const status = String(item.meta?.taskStatus ?? "");
  const hasRenderableFinalOutput = Boolean(output || storyFinalOutput);
  const summary = displayOutput
    ? getSummary(displayOutput)
    : storyPublishOutput
      ? getPublishSummary(storyPublishOutput)
      : String(
          storyFinalOutput?.finalCopy ??
            storyFinalOutput?.executiveSummary ??
            "Task selesai dan hasil utamanya siap ditinjau.",
        )
          .trim()
          .split(/\n+/)[0];
  const copyValue =
    getCopyContent(displayOutput) ??
    (storyPublishOutput
      ? [
          getPublishSummary(storyPublishOutput),
          storyPublishOutput.publicationUrl || storyPublishOutput.permalink
            ? `Link: ${String(storyPublishOutput.publicationUrl ?? storyPublishOutput.permalink)}`
            : null,
          storyPublishOutput.mediaId || storyPublishOutput.publicationId
            ? `Media ID: ${String(storyPublishOutput.mediaId ?? storyPublishOutput.publicationId)}`
            : null,
          storyPublishOutput.imageUrl
            ? `Visual: ${String(storyPublishOutput.imageUrl)}`
            : null,
          storyPublishOutput.caption
            ? `Caption:\n${String(storyPublishOutput.caption)}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : storyFinalOutput
        ? String(
            storyFinalOutput.finalCopy ??
              storyFinalOutput.executiveSummary ??
              "",
          ).trim()
        : "");
  const canApprove =
    taskId &&
    !publishOutput &&
    !storyPublishOutput &&
    outputs.some((entry) => {
      if (
        entry.stageName !== "marketing" &&
        entry.stageName !== "marketing_draft"
      ) {
        return false;
      }

      const content = parseContent(entry.content);
      return (
        typeof content === "object" &&
        content !== null &&
        (content as Record<string, unknown>).status === "pending_approval"
      );
    });

  const copyText = async () => {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    setCopyState("done");
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      className="relative z-10 flex justify-center"
    >
      <div className="w-full max-w-xl rounded-[28px] border border-border bg-card/95 p-5 shadow-sm backdrop-blur">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Final Review
        </p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">
          {publishOutput || storyPublishOutput
            ? "Hasil upload Instagram"
            : hasRenderableFinalOutput
              ? "Hasil akhir siap ditinjau"
              : "Hasil belum siap ditampilkan"}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-foreground">
          {summary}
        </p>

        {renderChiefFinalDecision(item)}
        {renderDecisionChain(item)}

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {displayOutput ? (
            <span className="rounded-full bg-muted px-3 py-1">
              {getReadableSource(displayOutput)}
            </span>
          ) : storyFinalOutput ? (
            <span className="rounded-full bg-muted px-3 py-1">
              {String(
                item.meta?.sourceStage ??
                  (item.meta?.storyEvent as { meta?: Record<string, unknown> })
                    ?.meta?.sourceStage ??
                  "Ringkasan akhir",
              )}
            </span>
          ) : null}
          {status ? (
            <span className="rounded-full bg-muted px-3 py-1">
              {getReadableStatus(status)}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onOpenResults}
          >
            Lihat Detail
          </Button>
          {taskId &&
          onApprove &&
          canApprove &&
          !publishOutput &&
          !storyPublishOutput ? (
            <Button
              type="button"
              className="rounded-full"
              onClick={() => onApprove(taskId)}
            >
              Setujui Draft
            </Button>
          ) : null}
          {taskId && onRetry ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onRetry(taskId)}
            >
              Ulangi
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={() => void copyText()}
            disabled={!copyValue}
          >
            {copyState === "done" ? "Tersalin" : "Copy"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// UI5: Chief Final Decision + Decision Chain
// ---------------------------------------------------------------------------

interface ChiefDecisionLike {
  verdict?: string;
  reason?: string;
  user_facing_summary?: string;
  required_follow_up?: string[];
  final_status?: string;
}

function renderChiefFinalDecision(item: StoryItem) {
  const raw =
    (item.meta?.chiefFinalDecision as ChiefDecisionLike | undefined) ??
    (item.meta?.decision as ChiefDecisionLike | undefined);
  if (!raw?.verdict) return null;

  const statusColor =
    raw.final_status === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : raw.final_status === "failed"
        ? "border-red-500/30 bg-red-500/5"
        : "border-blue-500/30 bg-blue-500/5";

  return (
    <div className={`mt-4 rounded-2xl border p-3.5 ${statusColor}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Verdict Pak Arga
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {raw.verdict}
      </p>
      {raw.user_facing_summary && (
        <p className="mt-2 rounded-xl bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground/80">
          {raw.user_facing_summary}
        </p>
      )}
      {raw.reason && raw.reason !== raw.user_facing_summary && (
        <p className="mt-1.5 text-xs text-muted-foreground">{raw.reason}</p>
      )}
      {Array.isArray(raw.required_follow_up) &&
        raw.required_follow_up.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up
            </p>
            <ul className="mt-1 space-y-0.5">
              {raw.required_follow_up.map((fu, i) => (
                <li key={`fu-${i}`} className="text-xs text-foreground/70">
                  • {fu}
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}

interface DecisionChainNode {
  agent: string;
  decision: string;
}

function getDecisionNodeColor(decision: string) {
  if (
    decision.startsWith("approve") ||
    decision === "success" ||
    decision === "strong"
  )
    return "bg-emerald-500 border-emerald-400";
  if (
    decision.startsWith("revise") ||
    decision === "acceptable" ||
    decision === "needs_user_review"
  )
    return "bg-amber-500 border-amber-400";
  if (
    decision.startsWith("stop") ||
    decision === "failed" ||
    decision === "reject"
  )
    return "bg-red-500 border-red-400";
  return "bg-muted border-border";
}

function getDecisionLineColor(decision: string) {
  if (
    decision.startsWith("approve") ||
    decision === "success" ||
    decision === "strong"
  )
    return "bg-emerald-500/40";
  if (
    decision.startsWith("revise") ||
    decision === "acceptable" ||
    decision === "needs_user_review"
  )
    return "bg-amber-500/40";
  if (
    decision.startsWith("stop") ||
    decision === "failed" ||
    decision === "reject"
  )
    return "bg-red-500/40";
  return "bg-muted/40";
}

function renderDecisionChain(item: StoryItem) {
  const meta = item.meta ?? {};
  const chain: DecisionChainNode[] = [];

  // Bu Rani
  const intelDecision =
    (meta.intelDecision as { decision?: string } | undefined)?.decision ??
    (meta.storyIntelDecision as string | undefined);
  if (intelDecision) {
    chain.push({ agent: "Bu Rani", decision: intelDecision });
  }

  // Pak Bima
  const marketingDecision =
    (meta.marketingDecision as { decision?: string } | undefined)?.decision ??
    (meta.storyMarketingDecision as string | undefined);
  if (marketingDecision) {
    chain.push({ agent: "Pak Bima", decision: marketingDecision });
  }

  // Pak Arga
  const chiefDecision =
    (meta.chiefFinalDecision as { final_status?: string } | undefined)
      ?.final_status ??
    (meta.decision as { final_status?: string } | undefined)?.final_status;
  if (chiefDecision) {
    chain.push({ agent: "Pak Arga", decision: chiefDecision });
  }

  if (chain.length < 2) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Decision Chain
      </p>
      <div className="flex items-center gap-0">
        {chain.map((node, i) => (
          <div key={node.agent} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 sm:w-10 ${getDecisionLineColor(chain[i - 1].decision)}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`size-3 rounded-full border ${getDecisionNodeColor(node.decision)}`}
                title={`${node.agent}: ${node.decision}`}
              />
              <span className="text-[9px] text-muted-foreground">
                {node.agent}
              </span>
              <span className="text-[9px] font-medium text-foreground/70">
                {node.decision.replace(/_/g, " ").slice(0, 12)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
