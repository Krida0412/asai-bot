import "server-only";

import { Composio } from "@composio/core";

export type ComposioIntegrationStatus =
  | "disabled"
  | "not_configured"
  | "configured_missing_auth_config"
  | "configured_no_account";

export interface ComposioAuthConfigStatus {
  instagramAuthConfigId: string | null;
  hasInstagramAuthConfig: boolean;
}

export interface ComposioStatusResult {
  status: ComposioIntegrationStatus;
  isConfigured: boolean;
  canExecuteActions: false;
  authConfig: ComposioAuthConfigStatus;
  reason: string;
}

export interface ComposioConnectionLinkResult {
  ok: boolean;
  provider: "instagram";
  connectionUrl: string | null;
  connectedAccountId: string | null;
  status:
    | "created"
    | "already_connected"
    | "disabled"
    | "not_configured"
    | "missing_auth_config"
    | "error";
  reason: string;
}

export interface ComposioConnectedAccountStatusResult {
  ok: boolean;
  provider: "instagram";
  isConnected: boolean;
  connectedAccountId: string | null;
  status:
    | "connected"
    | "not_connected"
    | "not_configured"
    | "missing_auth_config"
    | "error";
  reason: string;
}

const COMPOSIO_ACTIONS_ENABLED = false;

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

export function getComposioApiKeyForServer() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return apiKey;
}

export function getComposioInstagramAuthConfigIdForServer() {
  const authConfigId = process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID?.trim();

  if (!authConfigId) {
    return null;
  }

  return authConfigId;
}

export function getComposioAuthConfigStatus(): ComposioAuthConfigStatus {
  const instagramAuthConfigId = getComposioInstagramAuthConfigIdForServer();

  return {
    instagramAuthConfigId,
    hasInstagramAuthConfig: Boolean(instagramAuthConfigId),
  };
}

export function getComposioStatusForUser(
  _userId: string,
): ComposioStatusResult {
  const authConfig = getComposioAuthConfigStatus();

  if (!COMPOSIO_ACTIONS_ENABLED) {
    return {
      status: "disabled",
      isConfigured: isComposioConfigured(),
      canExecuteActions: false,
      authConfig,
      reason:
        "Composio actions are disabled until connected account mapping and approval flow are implemented.",
    };
  }

  if (!isComposioConfigured()) {
    return {
      status: "not_configured",
      isConfigured: false,
      canExecuteActions: false,
      authConfig,
      reason: "COMPOSIO_API_KEY is not configured.",
    };
  }

  if (!authConfig.hasInstagramAuthConfig) {
    return {
      status: "configured_missing_auth_config",
      isConfigured: true,
      canExecuteActions: false,
      authConfig,
      reason: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured.",
    };
  }

  return {
    status: "configured_no_account",
    isConfigured: true,
    canExecuteActions: false,
    authConfig,
    reason:
      "COMPOSIO_API_KEY and Instagram auth config are configured, but user connected account mapping is not implemented yet.",
  };
}

function readStringField(
  record: Record<string, unknown>,
  fieldNames: string[],
): string | null {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function readArrayField(
  record: Record<string, unknown>,
  fieldNames: string[],
): unknown[] {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedStringField(
  record: Record<string, unknown>,
  paths: string[][],
): string | null {
  for (const path of paths) {
    let value: unknown = record;

    for (const segment of path) {
      if (!isRecord(value)) {
        value = null;
        break;
      }

      value = value[segment];
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) =>
      collectStrings(item, depth + 1),
    );
  }

  return [];
}

function normalizeConnectedAccountListResponse(
  response: unknown,
): Array<Record<string, unknown>> {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (!isRecord(response)) {
    return [];
  }

  const items = readArrayField(response, [
    "items",
    "data",
    "connectedAccounts",
    "connected_accounts",
    "accounts",
    "results",
  ]);

  return items.filter(isRecord);
}

function getConnectedAccountId(account: Record<string, unknown>) {
  return (
    readStringField(account, [
      "id",
      "connectedAccountId",
      "connected_account_id",
      "accountId",
      "account_id",
    ]) ??
    readNestedStringField(account, [
      ["account", "id"],
      ["connectedAccount", "id"],
      ["connected_account", "id"],
    ])
  );
}

function getConnectedAccountStatus(account: Record<string, unknown>) {
  return (
    readStringField(account, [
      "status",
      "state",
      "connectionStatus",
      "connection_status",
    ]) ??
    readNestedStringField(account, [
      ["account", "status"],
      ["connectedAccount", "status"],
      ["connected_account", "status"],
    ]) ??
    ""
  );
}

function getConnectedAccountAuthConfigId(account: Record<string, unknown>) {
  return (
    readStringField(account, [
      "authConfigId",
      "auth_config_id",
      "authConfig",
      "auth_config",
    ]) ??
    readNestedStringField(account, [
      ["authConfig", "id"],
      ["auth_config", "id"],
      ["auth", "config", "id"],
    ])
  );
}

function isInstagramConnectedAccount(account: Record<string, unknown>) {
  const toolkit =
    readStringField(account, [
      "toolkit",
      "toolkitSlug",
      "toolkit_slug",
      "appName",
      "app_name",
    ]) ??
    readNestedStringField(account, [
      ["toolkit", "slug"],
      ["toolkit", "name"],
      ["app", "slug"],
      ["app", "name"],
      ["app", "key"],
      ["application", "name"],
    ]) ??
    "";

  const provider =
    readStringField(account, ["provider", "app", "name", "slug"]) ??
    readNestedStringField(account, [
      ["provider", "name"],
      ["provider", "slug"],
      ["integration", "name"],
      ["integration", "slug"],
    ]) ??
    "";

  const status = getConnectedAccountStatus(account);
  const allStrings = collectStrings(account).join(" ").toLowerCase();
  const normalizedIdentity =
    `${toolkit} ${provider} ${allStrings}`.toLowerCase();
  const normalizedStatus = status.toLowerCase();

  const looksLikeInstagram = normalizedIdentity.includes("instagram");

  const isRejectedState = [
    "dropped",
    "expired",
    "failed",
    "inactive",
    "disabled",
    "revoked",
    "deleted",
    "error",
  ].some((state) => normalizedStatus.includes(state));

  const looksConnected =
    !isRejectedState &&
    (normalizedStatus === "" ||
      normalizedStatus.includes("active") ||
      normalizedStatus.includes("connected") ||
      normalizedStatus.includes("enabled") ||
      normalizedStatus.includes("success"));

  return looksLikeInstagram && looksConnected;
}

function findActiveInstagramAccount(
  accounts: Array<Record<string, unknown>>,
  authConfigId: string,
) {
  const instagramAccounts = accounts.filter(isInstagramConnectedAccount);
  const authConfigMatchedAccount = instagramAccounts.find((account) => {
    const accountAuthConfigId = getConnectedAccountAuthConfigId(account);
    return !accountAuthConfigId || accountAuthConfigId === authConfigId;
  });

  return authConfigMatchedAccount ?? instagramAccounts[0] ?? null;
}

async function listConnectedAccountsForUser(params: {
  composio: Composio;
  userId: string;
  authConfigId: string;
}) {
  const listConnectedAccounts = params.composio.connectedAccounts.list as (
    input: Record<string, unknown>,
  ) => Promise<unknown>;

  const response = await listConnectedAccounts({
    userIds: [params.userId],
    authConfigIds: [params.authConfigId],
    auth_config_ids: [params.authConfigId],
    allowMultiple: true,
  });

  return normalizeConnectedAccountListResponse(response);
}

export async function getInstagramConnectedAccountStatusForUser(
  userId: string,
): Promise<ComposioConnectedAccountStatusResult> {
  const apiKey = getComposioApiKeyForServer();

  if (!apiKey) {
    return {
      ok: false,
      provider: "instagram",
      isConnected: false,
      connectedAccountId: null,
      status: "not_configured",
      reason: "COMPOSIO_API_KEY is not configured.",
    };
  }

  const authConfigId = getComposioInstagramAuthConfigIdForServer();

  if (!authConfigId) {
    return {
      ok: false,
      provider: "instagram",
      isConnected: false,
      connectedAccountId: null,
      status: "missing_auth_config",
      reason: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured.",
    };
  }

  try {
    const composio = new Composio({
      apiKey,
    });

    const accounts = await listConnectedAccountsForUser({
      composio,
      userId,
      authConfigId,
    });
    const instagramAccount = findActiveInstagramAccount(accounts, authConfigId);

    if (!instagramAccount) {
      return {
        ok: true,
        provider: "instagram",
        isConnected: false,
        connectedAccountId: null,
        status: "not_connected",
        reason: "No active Instagram account found for this user.",
      };
    }

    const connectedAccountId = getConnectedAccountId(instagramAccount);

    return {
      ok: true,
      provider: "instagram",
      isConnected: true,
      connectedAccountId,
      status: "connected",
      reason: "Instagram account is connected.",
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Composio connected account status error.";

    return {
      ok: false,
      provider: "instagram",
      isConnected: false,
      connectedAccountId: null,
      status: "error",
      reason: message,
    };
  }
}

export async function createInstagramConnectionLinkForUser(
  userId: string,
): Promise<ComposioConnectionLinkResult> {
  const apiKey = getComposioApiKeyForServer();

  if (!apiKey) {
    return {
      ok: false,
      provider: "instagram",
      connectionUrl: null,
      connectedAccountId: null,
      status: "not_configured",
      reason: "COMPOSIO_API_KEY is not configured.",
    };
  }

  const authConfigId = getComposioInstagramAuthConfigIdForServer();

  if (!authConfigId) {
    return {
      ok: false,
      provider: "instagram",
      connectionUrl: null,
      connectedAccountId: null,
      status: "missing_auth_config",
      reason: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured.",
    };
  }

  const existingStatus =
    await getInstagramConnectedAccountStatusForUser(userId);

  if (existingStatus.isConnected) {
    return {
      ok: true,
      provider: "instagram",
      connectionUrl: null,
      connectedAccountId: existingStatus.connectedAccountId,
      status: "already_connected",
      reason: "Instagram account is already connected.",
    };
  }

  try {
    const composio = new Composio({
      apiKey,
    });

    const linkConnectedAccount = composio.connectedAccounts.link as (
      userId: string,
      authConfigId: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;

    const connectionRequest = await linkConnectedAccount(userId, authConfigId, {
      allowMultiple: true,
    });

    const connectionRequestRecord = connectionRequest as Record<
      string,
      unknown
    >;

    const connectionUrl =
      typeof connectionRequestRecord.redirectUrl === "string"
        ? connectionRequestRecord.redirectUrl
        : typeof connectionRequestRecord.redirect_url === "string"
          ? connectionRequestRecord.redirect_url
          : typeof connectionRequestRecord.url === "string"
            ? connectionRequestRecord.url
            : null;

    const connectedAccountId =
      typeof connectionRequestRecord.connectedAccountId === "string"
        ? connectionRequestRecord.connectedAccountId
        : typeof connectionRequestRecord.connected_account_id === "string"
          ? connectionRequestRecord.connected_account_id
          : typeof connectionRequestRecord.id === "string"
            ? connectionRequestRecord.id
            : null;

    if (!connectionUrl) {
      return {
        ok: false,
        provider: "instagram",
        connectionUrl: null,
        connectedAccountId,
        status: "error",
        reason: "Composio did not return a connection URL.",
      };
    }

    return {
      ok: true,
      provider: "instagram",
      connectionUrl,
      connectedAccountId,
      status: "created",
      reason: "Instagram connection link created.",
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Composio connection error.";

    if (message.toLowerCase().includes("multiple connected accounts")) {
      const status = await getInstagramConnectedAccountStatusForUser(userId);

      if (status.isConnected) {
        return {
          ok: true,
          provider: "instagram",
          connectionUrl: null,
          connectedAccountId: status.connectedAccountId,
          status: "already_connected",
          reason: "Instagram account is already connected.",
        };
      }
    }

    return {
      ok: false,
      provider: "instagram",
      connectionUrl: null,
      connectedAccountId: null,
      status: "error",
      reason: message,
    };
  }
}

export function createComposioClientForServer() {
  if (!COMPOSIO_ACTIONS_ENABLED) {
    return null;
  }

  const apiKey = getComposioApiKeyForServer();

  if (!apiKey) {
    return null;
  }

  return new Composio({
    apiKey,
  });
}

export interface InstagramPublishInput {
  caption: string;
  imageUrl: string;
}

export interface InstagramPublishResult {
  ok: boolean;
  provider: "instagram";
  status:
    | "published"
    | "not_connected"
    | "not_configured"
    | "missing_auth_config"
    | "missing_image_url"
    | "error";
  connectedAccountId: string | null;
  mediaContainerId: string | null;
  publicationId: string | null;
  publicationUrl: string | null;
  reason: string;
  raw?: unknown;
}

function getInstagramCreateMediaActionSlug() {
  return (
    process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_ACTION?.trim() ||
    process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_TOOL_SLUG?.trim() ||
    "INSTAGRAM_POST_IG_USER_MEDIA"
  );
}

function getInstagramPublishMediaActionSlug() {
  return (
    process.env.COMPOSIO_INSTAGRAM_PUBLISH_MEDIA_ACTION?.trim() ||
    process.env.COMPOSIO_INSTAGRAM_PUBLISH_MEDIA_TOOL_SLUG?.trim() ||
    "INSTAGRAM_PUBLISH_IG_USER_MEDIA"
  );
}

async function executeComposioAction(args: {
  composio: unknown;
  actionSlug: string;
  userId: string;
  connectedAccountId: string;
  payload: Record<string, unknown>;
}) {
  const client = args.composio as Record<string, unknown>;
  const tools = isRecord(client.tools) ? client.tools : null;
  const actions = isRecord(client.actions) ? client.actions : null;

  const attempts: Array<() => Promise<unknown>> = [];

  const pushExecute = (target: Record<string, unknown> | null) => {
    if (!target || typeof target.execute !== "function") return;
    const execute = target.execute as (...input: unknown[]) => Promise<unknown>;
    attempts.push(() =>
      execute(args.actionSlug, {
        userId: args.userId,
        connectedAccountId: args.connectedAccountId,
        connected_account_id: args.connectedAccountId,
        arguments: args.payload,
        args: args.payload,
      }),
    );
    attempts.push(() =>
      execute(args.actionSlug, {
        user_id: args.userId,
        connected_account_id: args.connectedAccountId,
        arguments: args.payload,
        args: args.payload,
      }),
    );
    attempts.push(() =>
      execute({
        slug: args.actionSlug,
        name: args.actionSlug,
        userId: args.userId,
        connectedAccountId: args.connectedAccountId,
        connected_account_id: args.connectedAccountId,
        arguments: args.payload,
        args: args.payload,
      }),
    );
    attempts.push(() =>
      execute({
        action: args.actionSlug,
        userId: args.userId,
        connectedAccountId: args.connectedAccountId,
        params: args.payload,
      }),
    );
  };

  pushExecute(tools);
  pushExecute(actions);
  pushExecute(client);

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : "No compatible Composio execute method was available.";
  throw new Error(message);
}

function findStringByPreferredKeys(value: unknown, preferredKeys: string[]) {
  const queue: unknown[] = [value];
  const normalizedPreferredKeys = preferredKeys.map((key) => key.toLowerCase());

  while (queue.length > 0) {
    const item = queue.shift();
    if (!isRecord(item)) continue;

    for (const [key, raw] of Object.entries(item)) {
      if (
        normalizedPreferredKeys.includes(key.toLowerCase()) &&
        typeof raw === "string" &&
        raw.trim().length > 0
      ) {
        return raw.trim();
      }
      if (isRecord(raw) || Array.isArray(raw)) queue.push(raw);
    }
  }

  return null;
}

function extractMediaContainerId(result: unknown) {
  return findStringByPreferredKeys(result, [
    "creation_id",
    "creationId",
    "container_id",
    "containerId",
    "media_container_id",
    "mediaContainerId",
    "id",
  ]);
}

function extractPublicationId(result: unknown) {
  return findStringByPreferredKeys(result, [
    "media_id",
    "mediaId",
    "publication_id",
    "publicationId",
    "published_media_id",
    "publishedMediaId",
    "id",
  ]);
}

function extractPublicationUrl(result: unknown) {
  return findStringByPreferredKeys(result, [
    "permalink",
    "url",
    "media_url",
    "mediaUrl",
    "publication_url",
    "publicationUrl",
  ]);
}

function normalizeInstagramMediaPayload(input: InstagramPublishInput) {
  return {
    image_url: input.imageUrl,
    imageUrl: input.imageUrl,
    media_url: input.imageUrl,
    caption: input.caption,
  };
}

export async function publishInstagramImageForUser(
  userId: string,
  input: InstagramPublishInput,
): Promise<InstagramPublishResult> {
  const apiKey = getComposioApiKeyForServer();
  if (!apiKey) {
    return {
      ok: false,
      provider: "instagram",
      status: "not_configured",
      connectedAccountId: null,
      mediaContainerId: null,
      publicationId: null,
      publicationUrl: null,
      reason: "COMPOSIO_API_KEY is not configured.",
    };
  }

  const authConfigId = getComposioInstagramAuthConfigIdForServer();
  if (!authConfigId) {
    return {
      ok: false,
      provider: "instagram",
      status: "missing_auth_config",
      connectedAccountId: null,
      mediaContainerId: null,
      publicationId: null,
      publicationUrl: null,
      reason: "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured.",
    };
  }

  const imageUrl = input.imageUrl.trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return {
      ok: false,
      provider: "instagram",
      status: "missing_image_url",
      connectedAccountId: null,
      mediaContainerId: null,
      publicationId: null,
      publicationUrl: null,
      reason: "Instagram publishing requires a public http(s) image URL.",
    };
  }

  const connectionStatus =
    await getInstagramConnectedAccountStatusForUser(userId);
  if (!connectionStatus.isConnected || !connectionStatus.connectedAccountId) {
    return {
      ok: false,
      provider: "instagram",
      status: "not_connected",
      connectedAccountId: connectionStatus.connectedAccountId,
      mediaContainerId: null,
      publicationId: null,
      publicationUrl: null,
      reason: connectionStatus.reason || "Instagram account is not connected.",
    };
  }

  try {
    const composio = new Composio({ apiKey });
    const createActionSlug = getInstagramCreateMediaActionSlug();
    const publishActionSlug = getInstagramPublishMediaActionSlug();
    const createResult = await executeComposioAction({
      composio,
      actionSlug: createActionSlug,
      userId,
      connectedAccountId: connectionStatus.connectedAccountId,
      payload: normalizeInstagramMediaPayload(input),
    });

    const mediaContainerId = extractMediaContainerId(createResult);
    if (!mediaContainerId) {
      return {
        ok: false,
        provider: "instagram",
        status: "error",
        connectedAccountId: connectionStatus.connectedAccountId,
        mediaContainerId: null,
        publicationId: null,
        publicationUrl: null,
        reason:
          "Instagram media container was created but no container id was returned.",
        raw: createResult,
      };
    }

    const publishResult = await executeComposioAction({
      composio,
      actionSlug: publishActionSlug,
      userId,
      connectedAccountId: connectionStatus.connectedAccountId,
      payload: {
        creation_id: mediaContainerId,
        creationId: mediaContainerId,
        container_id: mediaContainerId,
        media_container_id: mediaContainerId,
      },
    });

    const publicationId = extractPublicationId(publishResult);
    const publicationUrl = extractPublicationUrl(publishResult);

    return {
      ok: true,
      provider: "instagram",
      status: "published",
      connectedAccountId: connectionStatus.connectedAccountId,
      mediaContainerId,
      publicationId,
      publicationUrl,
      reason: "Instagram media was published.",
      raw: publishResult,
    };
  } catch (error: unknown) {
    const reason =
      error instanceof Error
        ? error.message
        : "Unknown Instagram publish error.";
    return {
      ok: false,
      provider: "instagram",
      status: "error",
      connectedAccountId: connectionStatus.connectedAccountId,
      mediaContainerId: null,
      publicationId: null,
      publicationUrl: null,
      reason,
    };
  }
}
