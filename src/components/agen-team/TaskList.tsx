"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface TaskListProps {
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

interface TaskItem {
  id: string;
  intentType: string;
  status: string;
  createdAt: string;
}

function formatIntent(intentType: string) {
  const labels: Record<string, string> = {
    research_only: "Riset Saja",
    research_and_draft_content: "Riset + Draft",
    full_auto_publish: "Publikasi Otomatis",
    ask_operations_cost: "Audit Operasional",
    find_photo_only: "Cari Foto",
    continue_from_memory: "Lanjutkan Konteks",
    schedule_content: "Konten Terjadwal",
    cancel_task: "Pembatalan",
  };

  return labels[intentType] ?? intentType.replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusCopy(status: string) {
  const labels: Record<string, string> = {
    running: "Berjalan",
    completed: "Selesai",
    failed: "Gagal",
    cancelled: "Dibatalkan",
  };

  return labels[status] ?? status;
}

function getDotClass(status: string) {
  const map: Record<string, string> = {
    running: "bg-blue-500 animate-pulse",
    completed: "bg-green-500",
    failed: "bg-red-500",
    cancelled: "bg-gray-500",
  };

  return map[status] ?? "bg-gray-500";
}

export function TaskList({ activeTaskId, onSelectTask }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const load = async () => {
    try {
      const response = await fetch("/api/agen-team/tasks", {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        tasks?: TaskItem[];
      };

      setTasks((data.tasks ?? []).slice(0, 20));
    } catch {
      setTasks([]);
    }
  };

  useEffect(() => {
    const doLoad = async () => {
      await load();
    };

    void doLoad();
    const interval = window.setInterval(doLoad, 8000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const handleAction = async (
    action: "cancel_task" | "delete_task",
    taskId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      await fetch("/api/agen-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, task_id: taskId }),
      });
      await load();
    } catch (error) {
      console.error(error);
    }
  };

  const empty = useMemo(() => tasks.length === 0, [tasks.length]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          Daftar Tugas
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-4">
          {empty ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
              Belum ada tugas yang tersimpan.
            </div>
          ) : null}

          {tasks.map((task) => {
            const isActive = task.id === activeTaskId;
            return (
              <article
                key={task.id}
                className={cn(
                  "w-full rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-all duration-300",
                  isActive && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2.5 rounded-full",
                          getDotClass(task.status),
                        )}
                      />
                      <span className="truncate text-sm font-semibold text-foreground">
                        {formatIntent(task.intentType)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(task.createdAt)}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full border-border bg-background"
                    >
                      {getStatusCopy(task.status)}
                    </Badge>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTask(task.id)}
                        className="text-xs text-primary hover:text-primary/80 font-medium"
                      >
                        Buka
                      </button>

                      {task.status === "running" ? (
                        <button
                          type="button"
                          onClick={(e) =>
                            handleAction("cancel_task", task.id, e)
                          }
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Batalkan
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) =>
                            handleAction("delete_task", task.id, e)
                          }
                          className="text-xs text-muted-foreground hover:text-red-500 font-medium"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </ScrollArea>
    </section>
  );
}
