export type AgenTaskStatus = "running" | "completed" | "failed" | "cancelled";

export function isTaskStatusActive(status: string): boolean {
  return status === "running";
}

export function isTaskStatusTerminal(status: string): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

export function isTaskStale(params: {
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  lastOutputAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (params.status !== "running") return false;

  const now = params.now || new Date();

  // Find the latest activity timestamp
  const timestamps = [params.lastOutputAt, params.updatedAt, params.createdAt]
    .filter(Boolean)
    .map((t) => new Date(t as string | Date).getTime())
    .filter((t) => !Number.isNaN(t));

  if (timestamps.length === 0) return true;

  const lastActivityTime = Math.max(...timestamps);
  const timeSinceActivity = now.getTime() - lastActivityTime;

  // 15 minutes threshold, 5 mins in dev
  const thresholdMs =
    process.env.NODE_ENV === "development" ? 5 * 60 * 1000 : 15 * 60 * 1000;

  return timeSinceActivity > thresholdMs;
}
