"use client";

function formatCompact(value: number) {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface TeamMetrics {
  totalTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  successRatePct: number;
  failureRatePct: number;
  avgCostPerTask: number;
  avgTokensPerTask: number;
}

interface MetricsBarProps {
  metrics: TeamMetrics | null;
  runningCount: number;
}

export function MetricsBar({ metrics, runningCount }: MetricsBarProps) {
  const successRate = metrics?.successRatePct ?? 0;
  const totalTokens = metrics?.totalTokens ?? 0;
  const totalCost = metrics?.totalCostUsd ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/30 px-5 py-2.5 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>✅ Sukses:</span>
        <span className="font-semibold text-foreground">
          {formatPercent(successRate)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>🎯 Token:</span>
        <span className="font-semibold text-foreground">
          {formatCompact(totalTokens)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>💰 Biaya:</span>
        <span className="font-semibold text-foreground">
          {formatCurrency(totalCost)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>🔄 Berjalan:</span>
        <span className="font-semibold text-foreground">{runningCount}</span>
      </div>
    </div>
  );
}
