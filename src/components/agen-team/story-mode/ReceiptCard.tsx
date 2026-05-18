"use client";

import { motion } from "framer-motion";
import type { StoryItem } from "./types";

interface ReceiptCardProps {
  item: StoryItem;
  delay?: number;
}

function formatNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat("id-ID").format(numeric);
}

function formatCurrency(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function ReceiptCard({ item, delay = 0 }: ReceiptCardProps) {
  const meta = item.meta ?? {};
  const inputTokens = meta.inputTokens ?? meta.tokenUsageInput ?? 0;
  const outputTokens = meta.outputTokens ?? meta.tokenUsageOutput ?? 0;
  const totalTokens = Number(inputTokens) + Number(outputTokens);
  const estimatedCost =
    meta.estimatedCostUsd ?? meta.totalCostUsd ?? meta.costUsd ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      className="relative z-10 flex justify-center"
    >
      <div className="w-full max-w-md rounded-[28px] border border-border/70 bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Receipt Operasional
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            Data operasional task ini sudah dicatat oleh sistem.
          </h3>
        </div>

        {totalTokens > 0 || estimatedCost ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-muted/55 px-3 py-3">
              <div className="text-xs text-muted-foreground">Input token</div>
              <div className="mt-1 font-semibold text-foreground">
                {formatNumber(inputTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-muted/55 px-3 py-3">
              <div className="text-xs text-muted-foreground">Output token</div>
              <div className="mt-1 font-semibold text-foreground">
                {formatNumber(outputTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-muted/55 px-3 py-3">
              <div className="text-xs text-muted-foreground">Total token</div>
              <div className="mt-1 font-semibold text-foreground">
                {formatNumber(totalTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-muted/55 px-3 py-3">
              <div className="text-xs text-muted-foreground">
                Estimasi biaya
              </div>
              <div className="mt-1 font-semibold text-foreground">
                {estimatedCost ? formatCurrency(estimatedCost) : "-"}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Belum ada rincian token atau biaya yang perlu ditampilkan untuk
            tahap ini.
          </p>
        )}
      </div>
    </motion.div>
  );
}
