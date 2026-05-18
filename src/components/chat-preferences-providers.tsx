"use client";

import React from "react";

import { useObjectState } from "@/hooks/use-object-state";
import { CustomProviderConfig, UserPreferences, ServiceModelConfig } from "app-types/user";
import { fetcher, generateUUID } from "lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
  Check,
  Thermometer,
  Bot,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { safe } from "ts-safe";
import { useTranslations } from "next-intl";

import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Switch } from "ui/switch";
import { Badge } from "ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "ui/tabs";
import { Slider } from "ui/slider";
import { Textarea } from "ui/textarea";

import { cn } from "lib/utils";
import { SelectModel } from "./select-model";
import { ChatModel } from "app-types/chat";

// --- Types ---
interface ServiceCatalogEntry {
  id: string;
  name: string;
  description: string;
  baseURL: string;
  website: string;
  category: string;
  tags: string[];
  defaultModels: string[];
  color: string;
}

interface ProviderTestResult {
  success: boolean;
  latencyMs: number | null;
  models?: string[];
  error?: string;
}

interface ApiKeyFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}

// --- Sub-components ---
function ApiKeyField({ label, value, placeholder, onChange }: ApiKeyFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          placeholder={placeholder || "sk-..."}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ result, testing }: { result?: ProviderTestResult; testing: boolean }) {
  const t = useTranslations("Chat.ChatPreferences");
  if (testing) {
    return (
      <Badge variant="secondary" className="gap-1.5 text-xs">
        <Loader2 className="size-3 animate-spin" />
        {t("testing")}
      </Badge>
    );
  }
  if (!result) return null;
  if (result.success) {
    return (
      <Badge className="gap-1.5 text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10">
        <CheckCircle2 className="size-3" />
        {result.latencyMs}ms
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1.5 text-xs opacity-80">
      <AlertCircle className="size-3" />
      {t("failed")}
    </Badge>
  );
}

// --- Service Catalog Card ---
function ServiceCatalogCard({
  service,
  isAdded,
  onAdd,
}: {
  service: ServiceCatalogEntry;
  isAdded: boolean;
  onAdd: (service: ServiceCatalogEntry) => void;
}) {
  const t = useTranslations("Chat.ChatPreferences");
  const categoryColors: Record<string, string> = {
    inference: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    gateway: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    reasoning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    search: "bg-green-500/10 text-green-600 border-green-500/20",
    local: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4 rounded-xl border bg-card transition-all duration-200",
        "hover:shadow-md hover:border-primary/30",
        isAdded && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: service.color }}
          >
            {service.name[0]}
          </div>
          <div>
            <p className="font-semibold text-sm">{service.name}</p>
            <Badge
              variant="outline"
              className={cn("text-[10px] h-4", categoryColors[service.category] || "")}
            >
              {service.category}
            </Badge>
          </div>
        </div>
        <Button
          size="sm"
          variant={isAdded ? "secondary" : "outline"}
          className="flex-shrink-0 h-7 text-xs"
          onClick={() => onAdd(service)}
          disabled={isAdded}
        >
          {isAdded ? (
            <>
              <Check className="size-3 mr-1" />
              {t("added")}
            </>
          ) : (
            <>
              <Plus className="size-3 mr-1" />
              {t("add")}
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{service.description}</p>
      <div className="flex flex-wrap gap-1">
        {service.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground font-mono truncate">
        {service.baseURL}
      </div>
    </div>
  );
}

// --- Custom Provider Card ---
function CustomProviderCard({
  provider,
  index,
  onChange,
  onRemove,
}: {
  provider: CustomProviderConfig;
  index: number;
  onChange: (index: number, updates: Partial<CustomProviderConfig>) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations("Chat.ChatPreferences");
  const [expanded, setExpanded] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | undefined>();
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsInput, setModelsInput] = useState((provider.models || []).join(", "));

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(undefined);
    try {
      const res = await fetch("/api/ai/providers/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseURL: provider.baseURL, apiKey: provider.apiKey }),
      });
      const data: ProviderTestResult = await res.json();
      setTestResult(data);
      if (data.success && data.models && data.models.length > 0) {
        toast.success(`Connected! Found ${data.models.length} models.`);
      } else if (!data.success) {
        toast.error(data.error || "Connection failed");
      }
    } catch (e: any) {
      setTestResult({ success: false, latencyMs: null, error: e.message });
      toast.error("Connection failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const res = await fetch("/api/ai/providers/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseURL: provider.baseURL, apiKey: provider.apiKey }),
      });
      const data = await res.json();
      if (data.success && data.models?.length) {
        const newModels = data.models.slice(0, 30); // limit to 30 models
        setModelsInput(newModels.join(", "));
        onChange(index, { models: newModels });
        toast.success(`Fetched ${newModels.length} models!`);
      } else {
        toast.error(data.error || "Could not fetch models");
      }
    } catch (e: any) {
      toast.error(e.message || "Fetch failed");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleModelsInputChange = (v: string) => {
    setModelsInput(v);
    const models = v.split(",").map((m) => m.trim()).filter(Boolean);
    onChange(index, { models });
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-all duration-200",
        !provider.enabled && "opacity-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Switch
          checked={provider.enabled}
          onCheckedChange={(checked) => onChange(index, { enabled: checked })}
          aria-label="Enable provider"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{provider.name || t("unnamedProvider", { fallback: "Unnamed Provider" })}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {provider.baseURL || t("noUrlSet", { fallback: "No URL set" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge result={testResult} testing={isTesting} />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t flex flex-col gap-4 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("displayName")}
              </Label>
              <Input
                value={provider.name}
                onChange={(e) => onChange(index, { name: e.target.value })}
                placeholder="My Provider"
              />
            </div>
            <ApiKeyField
              label={t("apiKey")}
              value={provider.apiKey || ""}
              onChange={(v) => onChange(index, { apiKey: v })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("baseUrl")}
            </Label>
            <Input
              value={provider.baseURL || ""}
              onChange={(e) => onChange(index, { baseURL: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("models")}
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={handleFetchModels}
                disabled={isFetchingModels || !provider.baseURL}
              >
                {isFetchingModels ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                {t("fetchModels")}
              </Button>
            </div>
            <Input
              value={modelsInput}
              onChange={(e) => handleModelsInputChange(e.target.value)}
              placeholder="model-1, model-2, model-3"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("modelsHint")}
            </p>
            {provider.models && provider.models.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {provider.models.slice(0, 8).map((model) => (
                  <span
                    key={model}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono"
                  >
                    {model}
                  </span>
                ))}
                {provider.models.length > 8 && (
                  <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                    +{provider.models.length - 8} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              size="sm"
              variant="default"
              className="gap-1.5 text-xs"
              onClick={handleTest}
              disabled={isTesting || !provider.baseURL}
            >
              {isTesting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : testResult?.success ? (
                <Wifi className="size-3" />
              ) : testResult ? (
                <WifiOff className="size-3" />
              ) : (
                <Zap className="size-3" />
              )}
              {t("testConnection")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => onRemove(index)}
            >
              <Trash2 className="size-3" />
              {t("remove")}
            </Button>
          </div>

          {testResult && (
            <div
              className={cn(
                "text-xs p-3 rounded-lg border",
                testResult.success
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20",
              )}
            >
              {testResult.success ? (
                <span>
                  ✓ Connected in {testResult.latencyMs}ms •{" "}
                  {testResult.models?.length ?? 0} models available
                </span>
              ) : (
                <span>✗ {testResult.error}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---
export function ProvidersManagementContent() {
  const t = useTranslations("Chat.ChatPreferences");
  const commonT = useTranslations("Common");

  const [preferences, setPreferences] = useObjectState<UserPreferences>({
    apiKeys: {},
    customProviders: [],
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
      setPreferences({
        apiKeys: data.apiKeys || {},
        customProviders: data.customProviders || [],
      });
    },
  });

  const { data: catalog, isLoading: isCatalogLoading } = useSWR<ServiceCatalogEntry[]>(
    "/api/ai/providers",
    fetcher,
    { revalidateOnFocus: false },
  );

  const [isSaving, setIsSaving] = useState(false);

  const savePreferences = useCallback(async () => {
    safe(() => setIsSaving(true))
      .ifOk(() =>
        fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        }),
      )
      .ifOk(() => fetchPreferences())
      .watch((result) => {
        if (result.isOk) toast.success(t("providersSaved"));
        else toast.error(t("failedToSaveProviders"));
      })
      .watch(() => setIsSaving(false));
  }, [preferences, fetchPreferences]);

  const isDiff = useMemo(() => {
    if (!data) return false;
    return (
      JSON.stringify(preferences.apiKeys || {}) !== JSON.stringify(data.apiKeys || {}) ||
      JSON.stringify(preferences.customProviders || []) !==
        JSON.stringify(data.customProviders || [])
    );
  }, [preferences, data]);

  const updateApiKey = (providerKey: string, value: string) => {
    setPreferences((prev) => ({
      apiKeys: { ...(prev.apiKeys || {}), [providerKey]: value },
    }));
  };

  const addCustomProvider = (partial?: Partial<CustomProviderConfig>) => {
    setPreferences((prev) => ({
      customProviders: [
        ...(prev.customProviders || []),
        {
          id: generateUUID(),
          name: partial?.name || "New Provider",
          provider: "openai" as const,
          baseURL: partial?.baseURL || "",
          apiKey: partial?.apiKey || "",
          models: partial?.models || [],
          enabled: true,
        },
      ],
    }));
  };

  const updateCustomProvider = (index: number, updates: Partial<CustomProviderConfig>) => {
    setPreferences((prev) => {
      const newList = [...(prev.customProviders || [])];
      newList[index] = { ...newList[index], ...updates };
      return { customProviders: newList };
    });
  };

  const removeCustomProvider = (index: number) => {
    setPreferences((prev) => {
      const newList = [...(prev.customProviders || [])];
      newList.splice(index, 1);
      return { customProviders: newList };
    });
  };

  const addedCatalogIds = useMemo(() => {
    const names = new Set((preferences.customProviders || []).map((p) => p.name.toLowerCase()));
    return new Set(
      (catalog || []).filter((c) => names.has(c.name.toLowerCase())).map((c) => c.id),
    );
  }, [preferences.customProviders, catalog]);

  const BUILT_IN_PROVIDERS = [
    { key: "openai", label: "OpenAI", placeholder: "sk-proj-..." },
    { key: "google", label: "Google Gemini", placeholder: "AIza..." },
    { key: "anthropic", label: "Anthropic Claude", placeholder: "sk-ant-..." },
    { key: "xai", label: "xAI Grok", placeholder: "xai-..." },
    { key: "mistral", label: "Mistral AI", placeholder: "..." },
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-6">
        <h3 className="text-xl font-semibold">{t("aiProviders")}</h3>
        <p className="text-sm text-muted-foreground py-1">
          {t("aiProvidersDescription")}
        </p>
      </div>

      <Tabs defaultValue="keys" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6">
          <TabsTrigger value="keys">{t("apiKeys")}</TabsTrigger>
          <TabsTrigger value="catalog">{t("serviceCatalog")}</TabsTrigger>
          <TabsTrigger value="custom">{t("customEndpoints")}</TabsTrigger>
        </TabsList>

        {/* --- API Keys Tab --- */}
        <TabsContent value="keys" className="mt-0">
          <div className="flex flex-col gap-1 mb-4">
            <p className="text-sm text-muted-foreground">
              {t("apiKeysDescription")}
            </p>
          </div>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {BUILT_IN_PROVIDERS.map((p) => (
                <ApiKeyField
                  key={p.key}
                  label={p.label}
                  value={(preferences.apiKeys || {})[p.key] || ""}
                  placeholder={p.placeholder}
                  onChange={(v) => updateApiKey(p.key, v)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* --- Service Catalog Tab --- */}
        <TabsContent value="catalog" className="mt-0">
          <div className="flex flex-col gap-1 mb-4">
            <p className="text-sm text-muted-foreground">
              {t("serviceCatalogDescription")}
            </p>
          </div>
          {isCatalogLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {catalog?.map((service) => (
                <ServiceCatalogCard
                  key={service.id}
                  service={service}
                  isAdded={addedCatalogIds.has(service.id)}
                  onAdd={(s) => {
                    addCustomProvider({
                      name: s.name,
                      baseURL: s.baseURL,
                      models: s.defaultModels,
                    });
                    toast.success(`${s.name} added to custom providers`);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* --- Custom Endpoints Tab --- */}
        <TabsContent value="custom" className="mt-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {t("customEndpointsDescription")}
            </p>
            <Button
              size="sm"
              onClick={() => addCustomProvider()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              {t("addEndpoint")}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : !preferences.customProviders || preferences.customProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border rounded-xl bg-muted/20">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("noCustomEndpoints")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("noCustomEndpointsDesc")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => addCustomProvider()}>
                {t("addFirstEndpoint")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {preferences.customProviders.map((provider, i) => (
                <CustomProviderCard
                  key={provider.id}
                  provider={provider}
                  index={i}
                  onChange={updateCustomProvider}
                  onRemove={removeCustomProvider}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {isDiff && !isValidating && (
        <div className="flex pt-6 items-center justify-end gap-2 border-t mt-4 fade-in animate-in duration-300">
          <Button
            variant="ghost"
            onClick={() => {
              setPreferences({
                apiKeys: data?.apiKeys || {},
                customProviders: data?.customProviders || [],
              });
            }}
          >
            {commonT("cancel")}
          </Button>
          <Button disabled={isSaving || isLoading} onClick={savePreferences} className="gap-2">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {commonT("save")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Service Model Content
// ─────────────────────────────────────────────

type ModelKeyOf = keyof ServiceModelConfig & (
  | "topicNamingModel"
  | "imageTopicNamingModel"
  | "messageTranslationModel"
  | "compressionModel"
  | "agentInfoModel"
  | "libraryQueryRewriteModel"
);

interface AgentModelRowProps {
  title: string;
  description: string;
  value?: { provider: string; model: string };
  onChange: (model: ChatModel) => void;
  /** If provided, shows an enable toggle keyed to this boolean field */
  enabledKey?: keyof ServiceModelConfig;
  enabledValue?: boolean;
  onToggle?: (v: boolean) => void;
  children?: React.ReactNode;
}

function AgentModelRow({
  title,
  description,
  value,
  onChange,
  enabledKey,
  enabledValue,
  onToggle,
  children,
}: AgentModelRowProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onToggle !== undefined && (
            <Switch
              checked={!!enabledValue}
              onCheckedChange={onToggle}
              aria-label={`Enable ${title}`}
            />
          )}
          <span className="font-semibold text-sm truncate">{title}</span>
        </div>
      </div>

      {/* Body */}
      <div className="border-t px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
          <SelectModel
            currentModel={value as ChatModel | undefined}
            onSelect={onChange}
            align="end"
          />
        </div>
        {children}
      </div>
    </div>
  );
}

function TemperatureSection({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("Chat.ChatPreferences");
  const label =
    value < 0.3
      ? "Precise"
      : value < 0.7
        ? "Balanced"
        : value < 1.2
          ? "Creative"
          : "Wild";

  const labelColor =
    value < 0.3
      ? "text-blue-500"
      : value < 0.7
        ? "text-emerald-500"
        : value < 1.2
          ? "text-amber-500"
          : "text-red-500";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Thermometer className="size-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{t("temperature")}</span>
        <Badge
          variant="outline"
          className={cn("ml-auto text-xs font-mono", labelColor)}
        >
          {t("temperatureLabel", { value: value.toFixed(2), label: t(`temperature${label}`) })}
        </Badge>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t("temperatureDescription")}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-6">0</span>
          <Slider
            className="flex-1"
            min={0}
            max={2}
            step={0.05}
            value={[value]}
            onValueChange={([v]) => onChange(v)}
          />
          <span className="text-xs text-muted-foreground w-6">2</span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-6">
          <span>{t("temperaturePrecise")}</span>
          <span>{t("temperatureBalanced")}</span>
          <span>{t("temperatureCreative")}</span>
          <span>{t("temperatureWild")}</span>
        </div>
      </div>
    </div>
  );
}

export function ServiceModelContent() {
  const t = useTranslations("Chat.ChatPreferences");
  const commonT = useTranslations("Common");

  const [preferences, setPreferences] = useObjectState<UserPreferences>({
    temperature: 0.7,
    serviceModelConfig: {},
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
      setPreferences({
        temperature: data.temperature ?? 0.7,
        serviceModelConfig: data.serviceModelConfig ?? {},
      });
    },
  });

  const [isSaving, setIsSaving] = useState(false);

  const savePreferences = useCallback(async () => {
    safe(() => setIsSaving(true))
      .ifOk(() =>
        fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        }),
      )
      .ifOk(() => fetchPreferences())
      .watch((result) => {
        if (result.isOk) toast.success(t("serviceModelSaved"));
        else toast.error(t("failedToSaveServiceModel"));
      })
      .watch(() => setIsSaving(false));
  }, [preferences, fetchPreferences]);

  const isDiff = useMemo(() => {
    if (!data) return false;
    return (
      (preferences.temperature ?? 0.7) !== (data.temperature ?? 0.7) ||
      JSON.stringify(preferences.serviceModelConfig ?? {}) !==
        JSON.stringify(data.serviceModelConfig ?? {})
    );
  }, [preferences, data]);

  const cfg = preferences.serviceModelConfig ?? {};

  const updateModelCfg = (key: ModelKeyOf, model: ChatModel) => {
    setPreferences((prev) => ({
      serviceModelConfig: {
        ...(prev.serviceModelConfig ?? {}),
        [key]: model,
      },
    }));
  };

  const updateBoolCfg = (key: keyof ServiceModelConfig, value: boolean) => {
    setPreferences((prev) => ({
      serviceModelConfig: {
        ...(prev.serviceModelConfig ?? {}),
        [key]: value,
      },
    }));
  };

  const updateStringCfg = (key: keyof ServiceModelConfig, value: string) => {
    setPreferences((prev) => ({
      serviceModelConfig: {
        ...(prev.serviceModelConfig ?? {}),
        [key]: value,
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="size-5" />
          {t("serviceModel")}
        </h3>
        <p className="text-sm text-muted-foreground py-1">
          {t("serviceModelDescription")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* ── Temperature ── */}
        <TemperatureSection
          value={preferences.temperature ?? 0.7}
          onChange={(v) => setPreferences({ temperature: v })}
        />

        {/* ── Agent Models ── */}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t("agentModels")}
          </h4>

          <AgentModelRow
            title={t("topicAutoNamingAgent")}
            description={t("topicAutoNamingAgentDesc")}
            value={cfg.topicNamingModel}
            onChange={(m) => updateModelCfg("topicNamingModel", m)}
          />

          <AgentModelRow
            title={t("aiImageTopicNamingAgent")}
            description={t("aiImageTopicNamingAgentDesc")}
            value={cfg.imageTopicNamingModel}
            onChange={(m) => updateModelCfg("imageTopicNamingModel", m)}
          />

          <AgentModelRow
            title={t("messageTranslationAgent")}
            description={t("messageTranslationAgentDesc")}
            value={cfg.messageTranslationModel}
            onChange={(m) => updateModelCfg("messageTranslationModel", m)}
          />

          <AgentModelRow
            title={t("compressionAgent")}
            description={t("compressionAgentDesc")}
            value={cfg.compressionModel}
            onChange={(m) => updateModelCfg("compressionModel", m)}
          />

          <AgentModelRow
            title={t("agentInfoAgent")}
            description={t("agentInfoAgentDesc")}
            value={cfg.agentInfoModel}
            onChange={(m) => updateModelCfg("agentInfoModel", m)}
          />

          {/* Library query rewrite agent – has toggle + custom prompt */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Switch
                checked={!!cfg.libraryQueryRewrite}
                onCheckedChange={(v) => updateBoolCfg("libraryQueryRewrite", v)}
                aria-label={t("libraryQueryRewriteAgent")}
              />
              <span className="font-semibold text-sm">
                {t("libraryQueryRewriteAgent")}
              </span>
            </div>
            <div className="border-t px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {t("libraryQueryRewriteAgentDesc")}
                </span>
                <SelectModel
                  currentModel={cfg.libraryQueryRewriteModel as ChatModel | undefined}
                  onSelect={(m) => updateModelCfg("libraryQueryRewriteModel", m)}
                  align="end"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("customPrompt")}
                </Label>
                <Textarea
                  className="resize-none text-sm min-h-[70px]"
                  placeholder={t("customPromptPlaceholder")}
                  value={cfg.libraryQueryRewritePrompt ?? ""}
                  onChange={(e) =>
                    updateStringCfg(
                      "libraryQueryRewritePrompt",
                      e.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save / Cancel */}
      {isDiff && !isValidating && (
        <div className="flex pt-6 items-center justify-end gap-2 border-t mt-4 fade-in animate-in duration-300">
          <Button
            variant="ghost"
            onClick={() => {
              setPreferences({
                temperature: data?.temperature ?? 0.7,
                serviceModelConfig: data?.serviceModelConfig ?? {},
              });
            }}
          >
            {commonT("cancel")}
          </Button>
          <Button
            disabled={isSaving || isLoading}
            onClick={savePreferences}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {commonT("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
