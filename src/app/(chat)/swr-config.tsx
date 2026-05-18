"use client";

import { BasicUser } from "app-types/user";
import { useEffect, useMemo } from "react";
import { SWRConfig, SWRConfiguration } from "swr";

export function SWRConfigProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: BasicUser;
}) {
  const config = useMemo<SWRConfiguration>(() => {
    return {
      focusThrottleInterval: 30000,
      dedupingInterval: 2000,
      errorRetryCount: 1,
      fallback: {
        "/api/user/details": user,
      },
    };
  }, [user]);

  useEffect(() => {
    console.log(
      "%c █▀█ █▀ █▀█ █\n%c  █▀█ ▄█ █▀█ █\n\n%c⚡ ASAI — Intelligent AI Platform",
      "color: #6c63ff; font-weight: bold; font-family: monospace; font-size: 18px;",
      "color: #a78bfa; font-weight: bold; font-family: monospace; font-size: 18px;",
      "color: #888; font-size: 12px;",
    );
  }, []);
  return <SWRConfig value={config}>{children}</SWRConfig>;
}
