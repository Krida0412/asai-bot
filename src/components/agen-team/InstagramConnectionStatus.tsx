"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Instagram, CheckCircle2, AlertCircle } from "lucide-react";

type InstagramConnectionStatusResponse = {
  ok: boolean;
  provider: "instagram";
  isConnected: boolean;
  connectedAccountId: string | null;
  status:
    | "connected"
    | "not_connected"
    | "not_configured"
    | "missing_auth_config"
    | "unauthorized"
    | "error";
  reason: string;
};

type InstagramConnectResponse = {
  ok: boolean;
  provider: "instagram";
  connectionUrl: string | null;
  connectedAccountId: string | null;
  status:
    | "created"
    | "disabled"
    | "not_configured"
    | "missing_auth_config"
    | "unauthorized"
    | "error";
  reason: string;
};

export function InstagramConnectionStatus() {
  const [status, setStatus] =
    useState<InstagramConnectionStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        "/api/agen-team/composio/connect/instagram/status",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as InstagramConnectionStatusResponse;
      setStatus(data);

      if (!response.ok) {
        setErrorMessage(data.reason || "Status Instagram belum bisa dicek.");
      }
    } catch {
      setErrorMessage("Status Instagram belum bisa dicek.");
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        "/api/agen-team/composio/connect/instagram",
        {
          method: "POST",
        },
      );

      const data = (await response.json()) as InstagramConnectResponse;

      if (!response.ok || !data.connectionUrl) {
        setErrorMessage(
          data.reason || "Link koneksi Instagram belum tersedia.",
        );
        return;
      }

      window.location.href = data.connectionUrl;
    } catch {
      setErrorMessage("Gagal membuka koneksi Instagram.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const isConnected = Boolean(status?.isConnected);
  const isDisabledByConfig =
    status?.status === "not_configured" ||
    status?.status === "missing_auth_config" ||
    status?.status === "error";

  return (
    <div className="rounded-2xl border bg-background/80 p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted">
            <Instagram className="h-4 w-4" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-sm">Instagram</p>

              {isLoadingStatus ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Mengecek
                </Badge>
              ) : isConnected ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Terhubung
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Belum terhubung
                </Badge>
              )}
            </div>

            <p className="text-muted-foreground text-xs">
              {isConnected
                ? "Akun Instagram sudah terhubung untuk user ini. Publishing tetap menunggu approval flow."
                : "Hubungkan Instagram untuk menyiapkan tahap publikasi nanti. Draft konten tetap bisa dibuat tanpa koneksi."}
            </p>

            {errorMessage ? (
              <p className="text-destructive text-xs">{errorMessage}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus || isConnecting}
          >
            Refresh
          </Button>

          {!isConnected ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={isConnecting || isDisabledByConfig}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Membuka
                </>
              ) : (
                "Hubungkan Instagram"
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
