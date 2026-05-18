"use client";
import { useObjectState } from "@/hooks/use-object-state";
import { UserPreferences } from "app-types/user";
import { authClient } from "auth/client";
import { fetcher } from "lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Database,
  Eye,
  EyeOff,
  LinkIcon,
  Loader,
  Share2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { safe } from "ts-safe";

import { Button } from "ui/button";
import { ExamplePlaceholder } from "ui/example-placeholder";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";
import { McpServerCustomizationContent } from "./mcp-customization-popup";
import { MCPServerInfo } from "app-types/mcp";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { ChatExportSummary } from "app-types/chat-export";
import { formatDistanceToNow } from "date-fns";
import { notify } from "lib/notify";

export function UserInstructionsContent() {
  const t = useTranslations();

  const responseStyleExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.responseStyleExample1"),
      t("Chat.ChatPreferences.responseStyleExample2"),
      t("Chat.ChatPreferences.responseStyleExample3"),
      t("Chat.ChatPreferences.responseStyleExample4"),
    ],
    [],
  );

  const professionExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.professionExample1"),
      t("Chat.ChatPreferences.professionExample2"),
      t("Chat.ChatPreferences.professionExample3"),
      t("Chat.ChatPreferences.professionExample4"),
      t("Chat.ChatPreferences.professionExample5"),
    ],
    [],
  );

  const { data: session } = authClient.useSession();

  const [preferences, setPreferences] = useObjectState<UserPreferences>({
    displayName: "",
    responseStyleExample: "",
    profession: "",
    botName: "",
  });

  const {
    data,
    mutate: fetchPreferences,
    isLoading,
    isValidating,
  } = useSWR<UserPreferences>("/api/user/preferences", fetcher, {
    fallback: {},
    dedupingInterval: 0,
    onSuccess: (data) => {
      setPreferences(data);
    },
  });

  const [isSaving, setIsSaving] = useState(false);

  const savePreferences = async () => {
    safe(() => setIsSaving(true))
      .ifOk(() =>
        fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        }),
      )
      .ifOk(() => fetchPreferences())
      .watch((result) => {
        if (result.isOk)
          toast.success(t("Chat.ChatPreferences.preferencesSaved"));
        else toast.error(t("Chat.ChatPreferences.failedToSavePreferences"));
      })
      .watch(() => setIsSaving(false));
  };

  const isDiff = useMemo(() => {
    if ((data?.displayName || "") !== (preferences.displayName || ""))
      return true;
    if ((data?.profession || "") !== (preferences.profession || ""))
      return true;
    if (
      (data?.responseStyleExample || "") !==
      (preferences.responseStyleExample || "")
    )
      return true;
    if ((data?.botName || "") !== (preferences.botName || "")) return true;
    return false;
  }, [preferences, data]);

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.userInstructions")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.userInstructionsDescription")}
      </p>

      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2">
          <Label>{t("Chat.ChatPreferences.whatShouldWeCallYou")}</Label>
          {isLoading ? (
            <Skeleton className="h-9" />
          ) : (
            <Input
              placeholder={session?.user.name || ""}
              value={preferences.displayName}
              onChange={(e) => {
                setPreferences({
                  displayName: e.target.value,
                });
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("Chat.ChatPreferences.botName")}</Label>
          {isLoading ? (
            <Skeleton className="h-9" />
          ) : (
            <Input
              placeholder="ASAI"
              value={preferences.botName}
              onChange={(e) => {
                setPreferences({
                  botName: e.target.value,
                });
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-2 text-foreground flex-1">
          <Label>{t("Chat.ChatPreferences.whatBestDescribesYourWork")}</Label>
          <div className="relative w-full">
            {isLoading ? (
              <Skeleton className="h-9" />
            ) : (
              <>
                <Input
                  value={preferences.profession}
                  onChange={(e) => {
                    setPreferences({
                      profession: e.target.value,
                    });
                  }}
                />
                {(preferences.profession?.length ?? 0) === 0 && (
                  <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                    <ExamplePlaceholder placeholder={professionExamples} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-foreground">
          <Label>
            {t(
              "Chat.ChatPreferences.whatPersonalPreferencesShouldBeTakenIntoAccountInResponses",
            )}
          </Label>
          <span className="text-xs text-muted-foreground"></span>
          <div className="relative w-full">
            {isLoading ? (
              <Skeleton className="h-60" />
            ) : (
              <>
                <Textarea
                  className="h-60 resize-none"
                  value={preferences.responseStyleExample}
                  onChange={(e) => {
                    setPreferences({
                      responseStyleExample: e.target.value,
                    });
                  }}
                />
                {(preferences.responseStyleExample?.length ?? 0) === 0 && (
                  <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                    <ExamplePlaceholder placeholder={responseStyleExamples} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {isDiff && !isValidating && (
        <div className="flex pt-4 items-center justify-end fade-in animate-in duration-300">
          <Button variant="ghost">{t("Common.cancel")}</Button>
          <Button disabled={isSaving || isLoading} onClick={savePreferences}>
            {t("Common.save")}
            {isSaving && <Loader className="size-4 ml-2 animate-spin" />}
          </Button>
        </div>
      )}
    </div>
  );
}

export function MCPInstructionsContent() {
  const t = useTranslations("");
  const [search, setSearch] = useState("");
  const [mcpServer, setMcpServer] = useState<
    (MCPServerInfo & { id: string }) | null
  >(null);

  const { isLoading, data: mcpList } = useMcpList();

  if (mcpServer) {
    return (
      <McpServerCustomizationContent
        title={
          <div className="flex flex-col">
            <button
              onClick={() => setMcpServer(null)}
              className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="size-3" />
              {t("Common.back")}
            </button>
            {mcpServer.name}
          </div>
        }
        mcpServerInfo={mcpServer}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.mcpInstructions")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.mcpInstructionsDescription")}
      </p>

      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2 text-foreground flex-1">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder={t("Common.search")}
          />
        </div>
        <div className="flex flex-col gap-2 text-foreground flex-1">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))
          ) : mcpList?.length === 0 ? (
            <div className="flex flex-col gap-2 text-foreground flex-1">
              <p className="text-center py-8 text-muted-foreground">
                {t("MCP.configureYourMcpServerConnectionSettings")}
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              {mcpList?.map((mcp) => (
                <Button
                  onClick={() => setMcpServer({ ...mcp, id: mcp.id })}
                  variant={"outline"}
                  size={"lg"}
                  key={mcp.id}
                >
                  <p>{mcp.name}</p>
                  {mcp.error ? (
                    <AlertCircle className="size-3.5 text-destructive" />
                  ) : mcp.status == "loading" ? (
                    <Loader className="size-3.5 animate-spin" />
                  ) : null}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExportsManagementContent() {
  const t = useTranslations();

  const {
    data: exports,
    mutate: refetchExports,
    isLoading,
  } = useSWR<ChatExportSummary[]>("/api/export", fetcher);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (exportId: string) => {
    const answer = await notify.confirm({
      description: t("Chat.ChatPreferences.confirmDeleteExport"),
    });
    if (!answer) {
      return;
    }

    try {
      setDeletingId(exportId);
      const response = await fetch(`/api/export/${exportId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete export");
      }

      toast.success(t("Chat.ChatPreferences.exportDeleted"));
      refetchExports();
    } catch (_error) {
      toast.error(t("Chat.ChatPreferences.failedToDeleteExport"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (exportId: string) => {
    const link = `${window.location.origin}/export/${exportId}`;
    navigator.clipboard.writeText(link);
    toast.success(t("Chat.ChatPreferences.linkCopied"));
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.myExports")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.myExportsDescription")}
      </p>

      <div className="flex flex-col gap-4 w-full">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))
        ) : !exports || exports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Share2 className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {t("Chat.ChatPreferences.noExportsYet")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("Chat.ChatPreferences.exportHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {exports.map((exportItem) => (
              <div
                key={exportItem.id}
                onClick={() => {
                  window.open(`/export/${exportItem.id}`, "_blank");
                }}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{exportItem.title}</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-2 text-sm text-muted-foreground">
                      <span>
                        {t("Chat.ChatPreferences.exported")}{" "}
                        {formatDistanceToNow(new Date(exportItem.exportedAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {exportItem.expiresAt && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            {t("Chat.ChatPreferences.expires")}{" "}
                            {formatDistanceToNow(
                              new Date(exportItem.expiresAt),
                              {
                                addSuffix: true,
                              },
                            )}
                          </span>
                        </>
                      )}
                      {exportItem.commentCount > 0 && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            {exportItem.commentCount}{" "}
                            {t("Chat.ChatPreferences.comments")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCopyLink(exportItem.id);
                      }}
                      title={t("Chat.ChatPreferences.copyLink")}
                    >
                      <LinkIcon className="size-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(exportItem.id);
                      }}
                      disabled={deletingId === exportItem.id}
                      title={t("Common.delete")}
                    >
                      {deletingId === exportItem.id ? (
                        <Loader className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Memory & Knowledge Base Settings ─────────────────────────────────────────


interface MemorySettings {
  difyApiKey: string;
  difyDatasetId: string;
  difyEnabled: boolean;
  autoSummarize: boolean;
}

export function MemoryContent({ threadId }: { threadId?: string | null }) {
  const t = useTranslations("Chat.ChatPreferences");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [factsCount, setFactsCount] = useState<number | null>(null);

  const [settings, setSettings] = useState<MemorySettings>({
    difyApiKey: "",
    difyDatasetId: "",
    difyEnabled: false,
    autoSummarize: false,
  });

  // Load thread settings when threadId changes
  useEffect(() => {
    if (!threadId) return;
    fetch(`/api/chat/${threadId}/thread-settings`)
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          difyApiKey: data?.dify_config?.apiKey ?? "",
          difyDatasetId: data?.dify_config?.datasetId ?? "",
          difyEnabled: data?.dify_config?.enabled ?? false,
          autoSummarize: data?.auto_summarize ?? false,
        });
      })
      .catch(() => {});
  }, [threadId]);

  // Load facts count on mount
  useEffect(() => {
    import("@/app/api/chat/actions")
      .then(({ getUserFactsCountAction }) => getUserFactsCountAction())
      .then(setFactsCount)
      .catch(() => setFactsCount(0));
  }, []);

  const handleSave = useCallback(async () => {
    if (!threadId) {
      toast.error(t("noActiveThread"));
      return;
    }
    setIsSaving(true);
    try {
      const { updateThreadAction } = await import("@/app/api/chat/actions");
      await updateThreadAction(threadId, {
        auto_summarize: settings.autoSummarize,
        dify_config: settings.difyApiKey
          ? {
              apiKey: settings.difyApiKey,
              datasetId: settings.difyDatasetId,
              enabled: settings.difyEnabled,
            }
          : null,
      });
      toast.success(t("memorySettingsSaved"));
    } catch {
      toast.error(t("failedToSaveMemorySettings"));
    } finally {
      setIsSaving(false);
    }
  }, [threadId, settings, t]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          {t("memoryTitle")}
        </h3>
        <p className="text-sm text-muted-foreground py-2 pb-6">
          {t("memoryDescription")}
        </p>
      </div>

      {/* ── Memory Section ── */}
      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Brain className="w-4 h-4" />
          {t("memorySettings")}
        </h4>

        {/* Auto-summarize toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label>{t("autoSummarize")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("autoSummarizeDescription")}
            </p>
          </div>
          <button
            id="memory-auto-summarize-toggle"
            role="switch"
            aria-checked={settings.autoSummarize}
            onClick={() =>
              setSettings((p) => ({ ...p, autoSummarize: !p.autoSummarize }))
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              settings.autoSummarize ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                settings.autoSummarize ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Saved facts counter */}
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("savedFacts")}</span>
          <span className="text-sm font-semibold tabular-nums">
            {factsCount === null ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              factsCount
            )}
          </span>
        </div>
      </div>

      {/* ── Dify RAG Section ── */}
      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Database className="w-4 h-4" />
          {t("kbTitle")}
        </h4>
        <p className="text-xs text-muted-foreground -mt-2">
          {t("kbDescription")}
        </p>

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <Label>{t("memoryEnableKb")}</Label>
          <button
            id="memory-dify-enabled-toggle"
            role="switch"
            aria-checked={settings.difyEnabled}
            onClick={() =>
              setSettings((p) => ({ ...p, difyEnabled: !p.difyEnabled }))
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              settings.difyEnabled ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                settings.difyEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Dify API Key */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="memory-dify-api-key">{t("memoryApiKey")}</Label>
          <div className="relative">
            <Input
              id="memory-dify-api-key"
              type={showApiKey ? "text" : "password"}
              placeholder="ds-xxxxxxxxxxxxxxxxxxxxxxxx"
              value={settings.difyApiKey}
              onChange={(e) =>
                setSettings((p) => ({ ...p, difyApiKey: e.target.value }))
              }
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Dataset ID */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="memory-dify-dataset-id">{t("memoryDatasetId")}</Label>
          <Input
            id="memory-dify-dataset-id"
            type="text"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={settings.difyDatasetId}
            onChange={(e) =>
              setSettings((p) => ({ ...p, difyDatasetId: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button
          id="memory-save-button"
          onClick={handleSave}
          disabled={isSaving || !threadId}
        >
          {isSaving ? (
            <>
              {t("memorySaving")}
              <Loader className="w-4 h-4 ml-2 animate-spin" />
            </>
          ) : (
            t("memorySaveButton")
          )}
        </Button>
      </div>

      {!threadId && (
        <p className="text-xs text-muted-foreground text-center">
          {t("memoryNoThread")}
        </p>
      )}
    </div>
  );
}
