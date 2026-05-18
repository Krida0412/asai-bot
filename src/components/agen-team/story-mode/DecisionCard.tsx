"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  ShieldCheck,
  BarChart3,
  Sparkles,
} from "lucide-react";
import type { StoryItem } from "./types";
import { AGENT_PERSONAS } from "./personas";

interface DecisionCardProps {
  item: StoryItem;
  delay?: number;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;

type DecisionColor = "emerald" | "amber" | "red" | "blue" | "slate";

function getDecisionColor(decision?: string): DecisionColor {
  if (!decision) return "slate";
  if (
    decision.startsWith("approve") ||
    decision === "success" ||
    decision === "strong"
  )
    return "emerald";
  if (
    decision.startsWith("revise") ||
    decision === "acceptable" ||
    decision === "weak"
  )
    return "amber";
  if (
    decision.startsWith("stop") ||
    decision === "failed" ||
    decision === "reject"
  )
    return "red";
  if (decision === "needs_user_review") return "blue";
  return "slate";
}

const colorMap: Record<
  DecisionColor,
  {
    border: string;
    bg: string;
    badge: string;
    badgeText: string;
    icon: typeof CheckCircle2;
  }
> = {
  emerald: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    badge: "bg-emerald-500/15",
    badgeText: "text-emerald-400",
    icon: CheckCircle2,
  },
  amber: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/15",
    badgeText: "text-amber-400",
    icon: AlertTriangle,
  },
  red: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    badge: "bg-red-500/15",
    badgeText: "text-red-400",
    icon: XCircle,
  },
  blue: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    badge: "bg-blue-500/15",
    badgeText: "text-blue-400",
    icon: Eye,
  },
  slate: {
    border: "border-border/50",
    bg: "bg-muted/5",
    badge: "bg-muted/20",
    badgeText: "text-muted-foreground",
    icon: ShieldCheck,
  },
};

function ScoreBar({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const pct = Math.round(score * 100);
  const barColor =
    score >= 0.7
      ? "bg-emerald-500"
      : score >= 0.5
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: smoothEase, delay: 0.2 }}
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
        />
      </div>
      <span className="w-8 text-right text-[11px] font-medium text-foreground">
        {pct}%
      </span>
    </div>
  );
}

function TagPill({
  text,
  variant,
}: {
  text: string;
  variant: "green" | "red" | "muted";
}) {
  const cls =
    variant === "green"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : variant === "red"
        ? "bg-red-500/10 text-red-400 border-red-500/20"
        : "bg-muted/20 text-muted-foreground border-border/50";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {text}
    </span>
  );
}

export function DecisionCard({ item, delay = 0 }: DecisionCardProps) {
  const meta = item.meta ?? {};
  const speakerId = item.speakerId ?? "system";
  const persona = AGENT_PERSONAS[speakerId];
  const decision =
    (meta.decision as string) ??
    (meta.checkpoint as string) ??
    (meta.overallVerdict as string) ??
    "";
  const color = getDecisionColor(decision);
  const style = colorMap[color];
  const Icon = style.icon;

  const reason = (meta.reason as string) ?? "";
  const utterance = item.message ?? (meta.utterance as string) ?? "";
  const requiredChanges = Array.isArray(meta.requiredChanges)
    ? (meta.requiredChanges as string[])
    : [];
  const confidence =
    typeof meta.confidence === "number" ? meta.confidence : null;

  // Intelligence brief fields
  const brief = meta.intelligenceBrief as Record<string, unknown> | undefined;
  // Marketing review fields
  const review = meta.marketingReview as Record<string, unknown> | undefined;
  // Checkpoint fields
  const isCheckpoint = Boolean(meta.checkpoint);
  const proceed = meta.proceed as boolean | undefined;
  const concern = (meta.concern as string) ?? null;
  const guidance = (meta.guidance as string) ?? null;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.48, ease: smoothEase, delay }}
      className="relative z-10 flex justify-center px-2"
    >
      <div
        className={`w-full max-w-[90%] overflow-hidden rounded-[22px] border shadow-[0_16px_40px_-24px_rgba(15,23,42,0.5)] backdrop-blur-md sm:max-w-[78%] ${style.border} ${style.bg}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border/30 px-4 py-2.5">
          <div className="flex size-7 items-center justify-center rounded-full bg-muted/30 text-xs font-semibold">
            {persona.displayName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-foreground">
              {persona.displayName}
            </span>
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {persona.title}
            </span>
          </div>
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge} ${style.badgeText}`}
          >
            <Icon className="size-3" />
            {decision.replace(/_/g, " ")}
          </div>
          {confidence !== null && (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(confidence * 100)}%
            </span>
          )}
        </div>

        {/* Body */}
        <div className="space-y-2.5 px-4 py-3">
          {/* Utterance */}
          {utterance && (
            <p className="text-sm leading-relaxed text-foreground/90">
              {utterance}
            </p>
          )}

          {/* Reason */}
          {reason && reason !== utterance && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {reason}
            </p>
          )}

          {/* Required changes */}
          {requiredChanges.length > 0 && (
            <div className="rounded-xl bg-muted/10 px-3 py-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="size-3" />
                Perubahan Wajib
              </div>
              <ul className="space-y-0.5">
                {requiredChanges.map((change, i) => (
                  <li
                    key={`${change.slice(0, 20)}-${i}`}
                    className="text-xs text-foreground/80"
                  >
                    • {change}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Intelligence Brief (P5) */}
          {brief && (
            <div className="space-y-2 rounded-xl bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3" />
                Intelligence Brief
              </div>
              {typeof brief.coreAngle === "string" && (
                <p className="text-xs text-foreground/80">
                  <span className="font-medium">Angle:</span> {brief.coreAngle}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {Array.isArray(brief.allowedClaims) &&
                  (brief.allowedClaims as string[]).map((c, i) => (
                    <TagPill
                      key={`a-${c.slice(0, 15)}-${i}`}
                      text={c}
                      variant="green"
                    />
                  ))}
                {Array.isArray(brief.bannedClaims) &&
                  (brief.bannedClaims as string[]).map((c, i) => (
                    <TagPill
                      key={`b-${c.slice(0, 15)}-${i}`}
                      text={c}
                      variant="red"
                    />
                  ))}
              </div>
              {typeof brief.riskFrame === "string" && (
                <p className="text-[11px] text-amber-400/80">
                  ⚠️ {brief.riskFrame}
                </p>
              )}
              {typeof brief.requiredDisclaimer === "string" && (
                <p className="text-[11px] text-muted-foreground">
                  📋 {brief.requiredDisclaimer}
                </p>
              )}
            </div>
          )}

          {/* Marketing Review scores (P6) */}
          {review && (
            <div className="space-y-1.5 rounded-xl bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="size-3" />
                Marketing Review
              </div>
              <ScoreBar
                label="Positioning"
                score={Number(review.positioningScore ?? 0)}
              />
              <ScoreBar
                label="Audience"
                score={Number(review.audienceFitScore ?? 0)}
              />
              <ScoreBar
                label="Hook"
                score={Number(review.hookStrengthScore ?? 0)}
              />
              <ScoreBar
                label="Brief Fit"
                score={Number(review.briefAlignmentScore ?? 0)}
              />
            </div>
          )}

          {/* Chief Checkpoint (P8) */}
          {isCheckpoint && (
            <div className="space-y-1.5 rounded-xl bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="size-3" />
                {(meta.checkpointLabel as string) ?? "Checkpoint"}
              </div>
              <div className="flex items-center gap-1.5">
                {proceed ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="size-3.5 text-red-400" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {proceed ? "Proceed" : "Ditahan"}
                </span>
              </div>
              {concern && (
                <p className="text-[11px] text-amber-400/80">⚠️ {concern}</p>
              )}
              {guidance && (
                <p className="text-[11px] text-muted-foreground">
                  💡 {guidance}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
