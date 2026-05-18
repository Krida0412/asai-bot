"use client";

import {
  ResultsPanel,
  type StageOutput,
} from "@/components/agen-team/ResultsPanel";
import {
  STORY_PREVIEW_OUTPUTS,
  STORY_PREVIEW_STATUS,
  STORY_PREVIEW_TASK_ID,
} from "@/components/agen-team/story-mode/preview-data";
import { StoryMode } from "@/components/agen-team/story-mode/StoryMode";
import type {
  SSEEventLike,
  StageOutputLike,
} from "@/components/agen-team/story-mode/types";
import { TaskList } from "@/components/agen-team/TaskList";
import ChatBot from "@/components/chat-bot";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { generateUUID, safeJSONParse } from "@/lib/utils";
import {
  History,
  Instagram,
  Loader,
  PanelRightOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────
type AgenTeamView = "chief_chat" | "story";

interface TaskSummary {
  id: string;
  status: string;
}

interface TaskOutputsResponse {
  taskId: string;
  outputs: StageOutput[];
}

interface TaskDetails {
  taskId: string;
  status: string;
  outputs: StageOutput[];
}

type InstagramConnectionStatus =
  | "checking"
  | "connected"
  | "not_connected"
  | "unknown";

// ─── Helpers ─────────────────────────────────────────────────
function eventSignature(event: SSEEventLike) {
  return [
    event.type ?? "progress",
    event.kind ?? "",
    event.division ?? "system",
    event.msg ?? event.message ?? "",
    event.pct ?? 0,
    event.ts ?? event.timestamp ?? "",
    event.fromAgent ?? event.speakerId ?? "",
    event.toAgent ?? "",
    event.error ?? "",
    event.roomId ?? "",
    event.sceneId ?? "",
  ].join("|");
}

function dedupeEvents(events: SSEEventLike[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = eventSignature(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseOutputEvent(output: StageOutputLike): SSEEventLike | null {
  if (
    !output.stageName.startsWith("progress:") &&
    !output.stageName.startsWith("story:")
  ) {
    return null;
  }

  const parsed =
    typeof output.content === "string"
      ? safeJSONParse<Record<string, unknown>>(output.content)
      : null;

  if (typeof output.content === "object" && output.content !== null) {
    return output.content as SSEEventLike;
  }

  if (parsed?.success) {
    return parsed.value as SSEEventLike;
  }

  return null;
}

function buildLiveOutput(event: SSEEventLike, index: number): StageOutputLike {
  const stageName =
    event.type === "story" && event.kind
      ? `story:${event.kind}`
      : `progress:${(event.division ?? "system").toLowerCase()}`;

  return {
    id: `live-${index}-${eventSignature(event)}`,
    stageName,
    content: event,
    createdAt: event.timestamp ?? event.ts ?? new Date().toISOString(),
  };
}

function dedupeOutputs(outputs: StageOutputLike[]) {
  const seen = new Set<string>();

  return outputs.filter((output) => {
    const progressEvent = parseOutputEvent(output);
    const key = progressEvent
      ? `${output.stageName}:${eventSignature(progressEvent)}`
      : [
          output.id ?? "",
          output.stageName,
          output.createdAt ?? "",
          JSON.stringify(output.content),
        ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request gagal: ${response.status}`);
  }

  return response.json();
}

function InstagramConnectionGate({
  status,
  isConnecting,
  notice,
  onConnect,
  onRefresh,
  onBypass,
}: {
  status: InstagramConnectionStatus;
  isConnecting: boolean;
  notice: string | null;
  onConnect: () => void;
  onRefresh: () => void;
  onBypass: () => void;
}) {
  const isChecking = status === "checking";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8">
      <div className="w-full max-w-2xl rounded-[32px] border border-border/70 bg-background/90 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Instagram className="size-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Instagram Agency Workspace
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Hubungkan Instagram dulu
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Agen Team sekarang fokus khusus untuk briefing dan draft konten
                Instagram. Menghubungkan akun membantu menjaga konteks workspace
                tetap jelas. Ini tidak membuat konten dipublish otomatis.
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Setelah terhubung:</p>
              <p>
                Pak Arga akan membantu merapikan ide menjadi brief. Tim baru
                bekerja di StoryMode setelah kamu menyetujui rencana kontennya.
              </p>
            </div>

            {notice ? (
              <p className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}

            {status === "unknown" ? (
              <p className="text-xs text-muted-foreground">
                Status koneksi belum bisa dicek. Kamu tetap bisa membuka koneksi
                Instagram di tab baru, lalu halaman ini akan mengecek ulang
                otomatis.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={onConnect}
                disabled={isConnecting || isChecking}
                className="rounded-full"
              >
                {isConnecting || isChecking ? (
                  <Loader className="mr-2 size-4 animate-spin" />
                ) : (
                  <Instagram className="mr-2 size-4" />
                )}
                {isChecking ? "Mengecek koneksi" : "Hubungkan Instagram"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onRefresh}
                disabled={isConnecting || isChecking}
                className="rounded-full"
              >
                <RefreshCw className="mr-2 size-4" />
                Cek ulang
              </Button>
              {status === "unknown" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBypass}
                  disabled={isConnecting || isChecking}
                  className="rounded-full text-muted-foreground"
                >
                  Lanjut briefing manual
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────
export default function AgenTeamPage() {
  const searchParams = useSearchParams();
  const isStoryPreview = searchParams.get("storyPreview") === "1";
  const eventSourceRef = useRef<EventSource | null>(null);
  const instagramConnectionPopupRef = useRef<Window | null>(null);
  const instagramConnectionPollRef = useRef<number | null>(null);

  // ── View state ─────────────────────────────────────────────
  // The page has two views: chief_chat and story.
  // Rendering is driven by `view`, NOT by `activeTaskId` alone.
  const [view, setView] = useState<AgenTeamView>("chief_chat");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveEvents, setLiveEvents] = useState<SSEEventLike[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [instagramStatus, setInstagramStatus] =
    useState<InstagramConnectionStatus>("checking");
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
  const [instagramNotice, setInstagramNotice] = useState<string | null>(null);

  // Stable Chief Chat thread ID (per-session, not persisted to DB)
  const chiefThreadIdRef = useRef(generateUUID());
  const chiefThreadId = chiefThreadIdRef.current;

  const clearInstagramConnectionPolling = useCallback(() => {
    if (instagramConnectionPollRef.current) {
      window.clearInterval(instagramConnectionPollRef.current);
      instagramConnectionPollRef.current = null;
    }
  }, []);

  const refreshInstagramConnection = useCallback(
    async (options?: { silent?: boolean }) => {
      if (isStoryPreview) {
        setInstagramStatus("connected");
        return true;
      }

      if (!options?.silent) {
        setInstagramNotice(null);
        setInstagramStatus("checking");
      }

      const statusUrls = [
        "/api/agen-team/composio/connect/instagram/status",
        "/api/agen-team/composio/status/instagram",
      ];

      try {
        let lastOkResponse: Response | null = null;

        for (const url of statusUrls) {
          const response = await fetch(url, { cache: "no-store" });

          if (response.ok) {
            lastOkResponse = response;
            break;
          }
        }

        if (!lastOkResponse) {
          setInstagramStatus("unknown");
          return false;
        }

        const data = (await lastOkResponse.json()) as {
          connected?: boolean;
          isConnected?: boolean;
          status?: string;
          connectionStatus?: string;
          connectedAccount?: unknown;
          account?: unknown;
        };

        const statusText = String(
          data.status ?? data.connectionStatus ?? "",
        ).toLowerCase();
        const connected =
          data.connected === true ||
          data.isConnected === true ||
          statusText === "connected" ||
          statusText === "active" ||
          Boolean(data.connectedAccount) ||
          Boolean(data.account);

        setInstagramStatus(connected ? "connected" : "not_connected");
        return connected;
      } catch {
        setInstagramStatus("unknown");
        return false;
      }
    },
    [isStoryPreview],
  );

  const handleConnectInstagram = useCallback(async () => {
    setIsConnectingInstagram(true);
    setInstagramNotice(null);
    clearInstagramConnectionPolling();

    // Open a blank popup synchronously from the click event. If we wait until
    // after the async POST, many browsers treat it as non-user-initiated and
    // block it, which forces the main Agen Team page to navigate away.
    const popup = window.open(
      "about:blank",
      "agen-team-instagram-connect",
      "width=520,height=760",
    );

    try {
      const response = await fetch(
        "/api/agen-team/composio/connect/instagram",
        { method: "POST" },
      );

      const data = (await response.json()) as {
        ok?: boolean;
        connectionUrl?: string | null;
        connectedAccountId?: string | null;
        isConnected?: boolean;
        status?: string;
        reason?: string;
      };

      if (
        response.ok &&
        (data.isConnected || data.status === "already_connected")
      ) {
        popup?.close();
        setInstagramStatus("connected");
        setInstagramNotice(
          "Instagram sudah tersambung. Kamu bisa mulai briefing.",
        );
        return;
      }

      if (!response.ok || !data.connectionUrl) {
        popup?.close();
        setInstagramNotice(
          data.reason || "Link koneksi Instagram belum tersedia.",
        );
        return;
      }

      if (!popup || popup.closed) {
        setInstagramNotice(
          "Popup koneksi diblokir browser. Membuka koneksi di tab ini.",
        );
        window.location.href = data.connectionUrl;
        return;
      }

      popup.location.href = data.connectionUrl;
      instagramConnectionPopupRef.current = popup;
      setInstagramNotice(
        "Tab koneksi Instagram sudah dibuka. Setelah berhasil, halaman ini akan mengecek ulang otomatis.",
      );

      let attempts = 0;
      instagramConnectionPollRef.current = window.setInterval(async () => {
        attempts += 1;
        const connected = await refreshInstagramConnection({ silent: true });

        if (connected) {
          clearInstagramConnectionPolling();
          instagramConnectionPopupRef.current?.close();
          instagramConnectionPopupRef.current = null;
          setInstagramNotice(
            "Instagram sudah tersambung. Kamu bisa mulai briefing.",
          );
          return;
        }

        if (attempts >= 60) {
          clearInstagramConnectionPolling();
          setInstagramNotice(
            "Kalau koneksi sudah berhasil, tekan Cek ulang untuk masuk ke workspace.",
          );
        }
      }, 2000);
    } catch {
      popup?.close();
      setInstagramNotice("Gagal membuka koneksi Instagram.");
    } finally {
      setIsConnectingInstagram(false);
    }
  }, [clearInstagramConnectionPolling, refreshInstagramConnection]);

  useEffect(() => {
    void refreshInstagramConnection();
  }, [refreshInstagramConnection]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshInstagramConnection({ silent: true });
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshInstagramConnection]);

  useEffect(() => {
    return () => {
      clearInstagramConnectionPolling();
      instagramConnectionPopupRef.current = null;
    };
  }, [clearInstagramConnectionPolling]);

  // ── Stream / Task management ───────────────────────────────
  const closeStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);

  const loadTaskDetails = useCallback(async (taskId: string) => {
    const [tasksResponse, outputsResponse] = await Promise.all([
      fetchJSON<{ tasks: TaskSummary[] }>("/api/agen-team/tasks"),
      fetchJSON<TaskOutputsResponse>(`/api/agen-team/tasks/${taskId}/outputs`),
    ]);

    const currentTask = tasksResponse.tasks.find((task) => task.id === taskId);
    const outputs = outputsResponse.outputs ?? [];

    setLiveEvents([]);
    setTaskDetails({
      taskId,
      status: currentTask?.status ?? "running",
      outputs,
    });

    return {
      taskId,
      status: currentTask?.status ?? "running",
      outputs,
    };
  }, []);

  const openStream = useCallback(
    (taskId: string) => {
      closeStream();

      const source = new EventSource(`/api/agen-team/stream?taskId=${taskId}`);
      eventSourceRef.current = source;
      setIsStreaming(true);

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEventLike;
          setLiveEvents((prev) => dedupeEvents([...prev, data]));

          if (data.type === "done") {
            setTaskDetails((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.error ? "failed" : "completed",
                  }
                : prev,
            );
            closeStream();
            void loadTaskDetails(taskId);
          }
        } catch {
          // Ignore malformed keepalive frames
        }
      };

      source.onerror = () => {
        closeStream();
      };
    },
    [closeStream, loadTaskDetails],
  );

  const selectTask = useCallback(
    async (taskId: string) => {
      setActiveTaskId(taskId);
      setShowResults(false);
      const details = await loadTaskDetails(taskId);

      if (details.status === "running") {
        openStream(taskId);
      } else {
        closeStream();
      }
    },
    [closeStream, loadTaskDetails, openStream],
  );

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  // ── Navigation helpers ─────────────────────────────────────
  const openChiefChat = useCallback(() => {
    setView("chief_chat");
    setShowResults(false);
  }, []);

  const openTaskStory = useCallback(
    async (taskId: string) => {
      setActiveTaskId(taskId);
      setView("story");
      await selectTask(taskId);
    },
    [selectTask],
  );

  const handleTaskCreated = useCallback(
    (taskId: string) => {
      void openTaskStory(taskId);
    },
    [openTaskStory],
  );

  const handleRetry = useCallback(
    async (taskId: string) => {
      await fetchJSON("/api/agen-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry_task",
          task_id: taskId,
        }),
      });
      setShowResults(false);
      await selectTask(taskId);
    },
    [selectTask],
  );

  const handleApprove = useCallback(
    async (taskId: string) => {
      await fetchJSON("/api/agen-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_task",
          task_id: taskId,
        }),
      });
      await selectTask(taskId);
    },
    [selectTask],
  );

  // ── Derived state ──────────────────────────────────────────
  const storyOutputs = useMemo(() => {
    const persistedOutputs = taskDetails?.outputs ?? [];
    const liveOutputs = liveEvents.map((event, index) =>
      buildLiveOutput(event, index),
    );

    return dedupeOutputs([...persistedOutputs, ...liveOutputs]);
  }, [liveEvents, taskDetails?.outputs]);

  const previewTaskDetails = useMemo(
    () => ({
      taskId: STORY_PREVIEW_TASK_ID,
      status: STORY_PREVIEW_STATUS,
      outputs: STORY_PREVIEW_OUTPUTS as StageOutput[],
    }),
    [],
  );

  const effectiveTaskDetails = isStoryPreview
    ? previewTaskDetails
    : taskDetails;
  const effectiveStoryOutputs = isStoryPreview
    ? STORY_PREVIEW_OUTPUTS
    : storyOutputs;
  const effectiveStreaming = isStoryPreview ? false : isStreaming;
  const effectiveTaskId =
    effectiveTaskDetails?.taskId ??
    (isStoryPreview ? STORY_PREVIEW_TASK_ID : activeTaskId);

  // Show story when view is "story" or storyPreview is on
  const isStoryView = isStoryPreview || view === "story";
  const shouldShowInstagramGate =
    !isStoryView && instagramStatus !== "connected";

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* ── HEADER ───────────────────────────────────────── */}
      {isStoryView ? (
        <header className="border-b border-border/60 bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="leading-tight">
                <div className="font-medium text-foreground">Agen Team</div>
                <div className="text-xs">Mode cerita kantor</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Return to Chief Chat (full screen, NOT a drawer) */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={openChiefChat}
              >
                <User className="size-4" />
                Pak Arga
              </Button>

              {/* Task history drawer */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    <History className="size-4" />
                    Riwayat Tugas
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Riwayat Tugas</SheetTitle>
                    <SheetDescription>
                      Pilih task lain tanpa keluar dari mode cerita.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <TaskList
                      activeTaskId={activeTaskId}
                      onSelectTask={(taskId) => {
                        void openTaskStory(taskId);
                      }}
                    />
                  </div>
                </SheetContent>
              </Sheet>

              {/* Result detail drawer */}
              {effectiveTaskDetails && !isStoryPreview ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setShowResults(true)}
                >
                  <PanelRightOpen className="size-4" />
                  Detail
                </Button>
              ) : null}
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-border/60 bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="leading-tight">
                <div className="font-medium text-foreground">
                  Pak Arga · Chief Agent
                </div>
                <div className="text-xs text-muted-foreground">
                  Beri brief, lalu Pak Arga akan membagi kerja ke tim.
                </div>
              </div>
            </div>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  <History className="size-4" />
                  Riwayat Tugas
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Riwayat Tugas</SheetTitle>
                  <SheetDescription>
                    Buka story dari task yang sudah pernah dibuat.
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <TaskList
                    activeTaskId={activeTaskId}
                    onSelectTask={(taskId) => {
                      void openTaskStory(taskId);
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
      )}

      {/* ── BODY ─────────────────────────────────────────── */}
      {isStoryView ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <StoryMode
            taskId={effectiveTaskId}
            outputs={effectiveStoryOutputs}
            isStreaming={effectiveStreaming}
            status={effectiveTaskDetails?.status}
            onRetry={handleRetry}
            onApprove={handleApprove}
            onOpenResults={
              isStoryPreview ? undefined : () => setShowResults(true)
            }
          />
        </div>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {shouldShowInstagramGate ? (
            <InstagramConnectionGate
              status={instagramStatus}
              isConnecting={isConnectingInstagram}
              notice={instagramNotice}
              onConnect={() => void handleConnectInstagram()}
              onRefresh={() => void refreshInstagramConnection()}
              onBypass={() => setInstagramStatus("connected")}
            />
          ) : (
            <>
              <div className="mx-auto grid w-full max-w-6xl gap-3 rounded-3xl border border-border/70 bg-background/80 p-4 shadow-sm md:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Briefing konten Instagram
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ngobrol dengan Pak Arga untuk merapikan ide menjadi brief.
                    Setelah rencananya kamu setujui, baru tim masuk ke StoryMode
                    dan menyusun draft.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Rel briefing</p>
                  <p>
                    Tulis ide, produk, topik, tujuan, atau format Instagram yang
                    kebayang. Pak Arga akan menjaga agar brief tidak langsung
                    menjadi task sebelum kamu approve.
                  </p>
                </div>
              </div>
              <ChatBot
                threadId={chiefThreadId}
                initialMessages={[]}
                apiEndpoint="/api/agen-team/chief-chat"
                mode="agen-team-chief"
                inputPlaceholder="Tulis ide, produk, topik, atau arah konten Instagram..."
                onAgenTeamTaskCreated={handleTaskCreated}
              />
            </>
          )}
        </main>
      )}

      {/* ── RESULTS DRAWER ───────────────────────────────── */}
      {!isStoryPreview && taskDetails ? (
        <Sheet open={showResults} onOpenChange={setShowResults}>
          <SheetContent
            side="right"
            className="w-full border-l border-border p-0 sm:max-w-[420px]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Detail hasil task Agen Team</SheetTitle>
              <SheetDescription>
                Panel detail untuk melihat output dan status task Agen Team.
              </SheetDescription>
            </SheetHeader>
            <ResultsPanel
              taskId={taskDetails.taskId}
              outputs={storyOutputs as StageOutput[]}
              status={taskDetails.status}
              onRetry={handleRetry}
              onApprove={handleApprove}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
