import { Composio } from "@composio/core";
import { getSession } from "auth/server";
import {
  getComposioApiKeyForServer,
  getComposioInstagramAuthConfigIdForServer,
  getInstagramConnectedAccountStatusForUser,
} from "@/lib/composio/composio-service";

type FailureStage =
  | "status"
  | "resolve_ig_user_id"
  | "create_media"
  | "publish_media";

const STAGED_FILE_ERROR =
  "Instagram tool requires staged file upload; image URL is not accepted by this tool schema.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function collectObjectKeys(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectObjectKeys(item, depth + 1));
  }

  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...collectObjectKeys(child, depth + 1),
  ]);
}

function getNestedValue(
  value: unknown,
  path: string[],
): string | Record<string, unknown> | null {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }

  if (typeof current === "string" && current.trim().length > 0) {
    return current.trim();
  }

  if (isRecord(current)) {
    return current;
  }

  return null;
}

function getNested<T = unknown>(value: unknown, paths: string[][]): T | null {
  for (const path of paths) {
    let current: unknown = value;

    for (const segment of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[segment];
    }

    if (current !== null && current !== undefined) {
      return current as T;
    }
  }

  return null;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
}

function maskToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 10) return `${token.slice(0, 2)}...${token.slice(-2)}`;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function collectCandidateValues(
  source: unknown,
  labels: Array<{ label: string; path: string[] }>,
) {
  return labels
    .map(({ label, path }) => ({
      source: label,
      value: getNestedValue(source, path),
    }))
    .filter((entry) => entry.value !== null);
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];

  if (typeof value === "string") return [value];
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

function schemaLooksLikeStagedFileOnly(schema: unknown) {
  const keys = collectObjectKeys(schema).map((key) => key.toLowerCase());
  const text = collectStrings(schema).join(" ").toLowerCase();

  const acceptsImageUrl = [
    "image_url",
    "imageurl",
    "media_url",
    "mediaurl",
    "url",
  ].some((key) => keys.includes(key));

  const requiresStagedFile =
    text.includes("file descriptor") ||
    text.includes("staged file") ||
    text.includes("uploaded file") ||
    text.includes("upload file") ||
    keys.some((key) =>
      ["file", "files", "file_id", "fileid", "attachment"].includes(key),
    );

  return requiresStagedFile && !acceptsImageUrl;
}

function rawLooksLikeStagedFileError(raw: unknown) {
  const text = collectStrings(raw).join(" ").toLowerCase();

  return (
    (text.includes("file") || text.includes("upload")) &&
    (text.includes("descriptor") ||
      text.includes("staged") ||
      text.includes("schema") ||
      text.includes("invalid") ||
      text.includes("required"))
  );
}

function failure(stage: FailureStage, error: string, raw: unknown = null) {
  return Response.json(
    {
      success: false,
      stage,
      error,
      raw,
    },
    { status: stage === "status" ? 400 : 502 },
  );
}

function debugFailure(
  connectedAccountId: string | null,
  availableKeys: string[],
  candidateValues: Array<{ source: string; value: unknown }>,
) {
  return Response.json(
    {
      success: false,
      stage: "resolve_ig_user_id",
      error:
        "Instagram create-media tool requires ig_user_id, but it could not be resolved from request body, env, or connected account metadata.",
      debug: {
        connectedAccountId,
        availableKeys,
        candidateValues,
      },
    },
    { status: 400 },
  );
}

function getCreateMediaToolSlug() {
  return (
    process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_ACTION?.trim() ||
    process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_TOOL_SLUG?.trim() ||
    "INSTAGRAM_POST_IG_USER_MEDIA"
  );
}

function getPublishMediaToolSlug() {
  return (
    process.env.COMPOSIO_INSTAGRAM_PUBLISH_MEDIA_ACTION?.trim() ||
    process.env.COMPOSIO_INSTAGRAM_PUBLISH_MEDIA_TOOL_SLUG?.trim() ||
    "INSTAGRAM_PUBLISH_IG_USER_MEDIA"
  );
}

function getComposioToolkitVersionBody() {
  const version =
    process.env.COMPOSIO_INSTAGRAM_TOOL_VERSION?.trim() ||
    process.env.COMPOSIO_TOOLKIT_VERSION_INSTAGRAM?.trim();

  if (version) {
    return { version };
  }

  return { dangerouslySkipVersionCheck: true };
}

async function getToolInputSchema(params: {
  composio: Composio;
  toolSlug: string;
}) {
  try {
    return await params.composio.tools.getInput(params.toolSlug, { text: "" });
  } catch (error) {
    return {
      schemaLookupError:
        error instanceof Error ? error.message : "Unknown schema lookup error.",
    };
  }
}

async function executeInstagramTool(params: {
  composio: Composio;
  toolSlug: string;
  userId: string;
  connectedAccountId: string;
  arguments: Record<string, unknown>;
}) {
  return await params.composio.tools.execute(params.toolSlug, {
    userId: params.userId,
    connectedAccountId: params.connectedAccountId,
    arguments: params.arguments,
    ...getComposioToolkitVersionBody(),
  });
}

async function listConnectedAccountsForUser(params: {
  composio: Composio;
  userId: string;
  authConfigId: string;
}) {
  const listConnectedAccounts = params.composio.connectedAccounts.list as (
    input: Record<string, unknown>,
  ) => Promise<unknown>;

  return await listConnectedAccounts({
    userIds: [params.userId],
    authConfigIds: [params.authConfigId],
    auth_config_ids: [params.authConfigId],
    allowMultiple: true,
  });
}

function normalizeConnectedAccounts(
  response: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (!isRecord(response)) {
    return [];
  }

  const items = getNested<unknown[]>(response, [
    ["items"],
    ["data"],
    ["connectedAccounts"],
    ["connected_accounts"],
    ["accounts"],
    ["results"],
  ]);

  return Array.isArray(items) ? items.filter(isRecord) : [];
}

function findConnectedAccountRecord(
  payload: unknown,
  connectedAccountId: string,
): Record<string, unknown> | null {
  for (const item of normalizeConnectedAccounts(payload)) {
    const localId = readString(item, [
      "id",
      "connectedAccountId",
      "connected_account_id",
      "accountId",
      "account_id",
      "externalId",
      "external_id",
    ]);

    if (localId === connectedAccountId) {
      return item;
    }
  }

  return null;
}

interface ResolvedInstagramAccountInfo {
  igUserId: string;
  instagramUsername: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
  source: string;
}

function findFirstInstagramBusinessAccount(graphResponse: unknown) {
  const pages = getNested<unknown[]>(graphResponse, [["data"]]);
  if (!Array.isArray(pages)) {
    return null;
  }

  for (const page of pages) {
    if (!isRecord(page)) continue;

    const instagramBusinessAccount = getNested<Record<string, unknown>>(page, [
      ["instagram_business_account"],
    ]);

    if (!instagramBusinessAccount) continue;

    const igUserId = readString(instagramBusinessAccount, ["id"]);
    if (!igUserId) continue;

    return {
      igUserId,
      instagramUsername:
        readString(instagramBusinessAccount, ["username"]) || null,
      facebookPageId: readString(page, ["id"]) || null,
      facebookPageName: readString(page, ["name"]) || null,
    };
  }

  return null;
}

async function resolveIgUserIdFromConnectedAccount(params: {
  connectedAccount: Record<string, unknown> | null;
}) {
  const metadataCandidates = [
    { label: "connected_account.ig_user_id", path: ["ig_user_id"] },
    { label: "connected_account.igUserId", path: ["igUserId"] },
    {
      label: "connected_account.instagram_user_id",
      path: ["instagram_user_id"],
    },
    {
      label: "connected_account.instagramUserId",
      path: ["instagramUserId"],
    },
    { label: "connected_account.account_id", path: ["account_id"] },
    { label: "connected_account.accountId", path: ["accountId"] },
    { label: "connected_account.external_id", path: ["external_id"] },
    { label: "connected_account.externalId", path: ["externalId"] },
    {
      label: "connected_account.data.ig_user_id",
      path: ["data", "ig_user_id"],
    },
    { label: "connected_account.data.igUserId", path: ["data", "igUserId"] },
    {
      label: "connected_account.data.instagram_user_id",
      path: ["data", "instagram_user_id"],
    },
    {
      label: "connected_account.data.instagramUserId",
      path: ["data", "instagramUserId"],
    },
    {
      label: "connected_account.data.account_id",
      path: ["data", "account_id"],
    },
    { label: "connected_account.data.accountId", path: ["data", "accountId"] },
    {
      label: "connected_account.metadata.ig_user_id",
      path: ["metadata", "ig_user_id"],
    },
    {
      label: "connected_account.metadata.account_id",
      path: ["metadata", "account_id"],
    },
    { label: "connected_account.profile.id", path: ["profile", "id"] },
    { label: "connected_account.account.id", path: ["account", "id"] },
    {
      label: "connected_account.connectedAccount.id",
      path: ["connectedAccount", "id"],
    },
  ];

  const candidateValues = collectCandidateValues(
    params.connectedAccount,
    metadataCandidates,
  );

  const metadataIgUserId =
    candidateValues.find((entry) => typeof entry.value === "string")?.value ||
    null;

  if (typeof metadataIgUserId === "string") {
    return {
      result: {
        igUserId: metadataIgUserId,
        instagramUsername: null,
        facebookPageId: null,
        facebookPageName: null,
        source: "connected_account_metadata",
      } satisfies ResolvedInstagramAccountInfo,
      candidateValues,
      graphResponse: null,
      maskedAccessToken: null,
    };
  }

  const accessToken =
    readString(params.connectedAccount ?? {}, ["access_token"]) ||
    readString(
      getNested<Record<string, unknown>>(params.connectedAccount, [["data"]]) ??
        {},
      ["access_token"],
    ) ||
    null;

  const maskedAccessToken = maskToken(accessToken);

  if (!accessToken) {
    return {
      result: null,
      candidateValues,
      graphResponse: null,
      maskedAccessToken,
    };
  }

  const graphApiVersion = process.env.GRAPH_API_VERSION?.trim() || "v20.0";
  const graphUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/me/accounts`,
  );
  graphUrl.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username}",
  );
  graphUrl.searchParams.set("access_token", accessToken);

  const response = await fetch(graphUrl.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const graphResponse = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      result: null,
      candidateValues,
      graphResponse,
      maskedAccessToken,
    };
  }

  const account = findFirstInstagramBusinessAccount(graphResponse);
  if (!account) {
    return {
      result: null,
      candidateValues,
      graphResponse,
      maskedAccessToken,
    };
  }

  return {
    result: {
      ...account,
      source: "meta_graph_lookup",
    } satisfies ResolvedInstagramAccountInfo,
    candidateValues,
    graphResponse,
    maskedAccessToken,
  };
}

function isToolFailure(raw: unknown) {
  if (!isRecord(raw)) return false;
  if (raw.successful === false) return true;
  return typeof raw.error === "string" && raw.error.trim().length > 0;
}

function getToolError(raw: unknown, fallback: string) {
  if (isRecord(raw) && typeof raw.error === "string" && raw.error.trim()) {
    return raw.error.trim();
  }

  return fallback;
}

function findStringByKeys(value: unknown, keys: string[]) {
  const queue: unknown[] = [value];
  const normalizedKeys = keys.map((key) => key.toLowerCase());

  while (queue.length > 0) {
    const item = queue.shift();
    if (!isRecord(item)) continue;

    for (const [key, raw] of Object.entries(item)) {
      if (
        normalizedKeys.includes(key.toLowerCase()) &&
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

function extractMediaId(raw: unknown) {
  return (
    findStringByKeys(raw, [
      "id",
      "creation_id",
      "creationId",
      "container_id",
      "containerId",
      "media_id",
      "mediaId",
      "media_container_id",
      "mediaContainerId",
    ]) ??
    getNested<string>(raw, [
      ["data", "id"],
      ["data", "creation_id"],
      ["data", "container_id"],
      ["result", "id"],
      ["result", "creation_id"],
      ["result", "container_id"],
    ])
  );
}

function extractPermalink(raw: unknown) {
  return findStringByKeys(raw, [
    "permalink",
    "url",
    "media_url",
    "mediaUrl",
    "publication_url",
    "publicationUrl",
  ]);
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return Response.json(
      {
        success: false,
        stage: "status",
        error: "Unauthorized.",
        raw: null,
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return failure(
      "status",
      error instanceof Error ? error.message : "Invalid JSON body.",
    );
  }

  if (!isRecord(body)) {
    return failure("status", "Request body must be a JSON object.");
  }

  const imageUrl = readString(body, ["imageUrl", "image_url"]);
  const caption = readString(body, ["caption"]);
  const bodyIgUserId = readString(body, ["igUserId", "ig_user_id"]);

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return failure("status", "imageUrl must be a public http(s) URL.");
  }

  if (!caption) {
    return failure("status", "caption is required.");
  }

  const apiKey = getComposioApiKeyForServer();
  if (!apiKey) {
    return failure("status", "COMPOSIO_API_KEY is not configured.");
  }

  const authConfigId = getComposioInstagramAuthConfigIdForServer();
  if (!authConfigId) {
    return failure(
      "status",
      "COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured.",
    );
  }

  const status = await getInstagramConnectedAccountStatusForUser(
    session.user.id,
  );

  if (!status.ok || !status.isConnected || !status.connectedAccountId) {
    return failure(
      "status",
      status.reason || "Instagram account is not connected.",
      status,
    );
  }

  const composio = new Composio({ apiKey });
  const createMediaToolSlug = getCreateMediaToolSlug();
  const publishMediaToolSlug = getPublishMediaToolSlug();
  const connectedAccountsRaw = await listConnectedAccountsForUser({
    composio,
    userId: session.user.id,
    authConfigId,
  }).catch(() => null);
  const connectedAccount = findConnectedAccountRecord(
    connectedAccountsRaw,
    status.connectedAccountId,
  );
  const availableKeys = dedupeStrings(collectObjectKeys(connectedAccount));
  const metadataResolution = await resolveIgUserIdFromConnectedAccount({
    connectedAccount,
  });
  const resolvedAccountInfo =
    (bodyIgUserId
      ? {
          igUserId: bodyIgUserId,
          instagramUsername: null,
          facebookPageId: null,
          facebookPageName: null,
          source: "request_body_override",
        }
      : metadataResolution.result) ?? null;

  if (!resolvedAccountInfo) {
    const graphError = getNested<string>(metadataResolution.graphResponse, [
      ["error", "message"],
    ]);

    if (
      metadataResolution.graphResponse &&
      !findFirstInstagramBusinessAccount(metadataResolution.graphResponse)
    ) {
      return Response.json(
        {
          success: false,
          stage: "resolve_ig_user_id",
          error:
            graphError ||
            "No Instagram Business Account was found for the connected Facebook Page. Make sure the connected Meta account has a Facebook Page linked to an Instagram Business or Creator account.",
          debug: {
            connectedAccountId: status.connectedAccountId,
            graphResponse: metadataResolution.graphResponse,
            maskedAccessToken: metadataResolution.maskedAccessToken,
          },
        },
        { status: 400 },
      );
    }

    return debugFailure(status.connectedAccountId, availableKeys, [
      { source: "body.igUserId", value: bodyIgUserId },
      ...metadataResolution.candidateValues,
      {
        source: "connected_account.access_token",
        value: metadataResolution.maskedAccessToken,
      },
    ]);
  }

  const createMediaArguments = removeUndefined({
    ig_user_id: resolvedAccountInfo.igUserId,
    image_url: imageUrl,
    url: imageUrl,
    caption,
  });

  const createSchema = await getToolInputSchema({
    composio,
    toolSlug: createMediaToolSlug,
  });

  if (schemaLooksLikeStagedFileOnly(createSchema)) {
    return failure("create_media", STAGED_FILE_ERROR, createSchema);
  }

  let createRaw: unknown;
  try {
    createRaw = await executeInstagramTool({
      composio,
      toolSlug: createMediaToolSlug,
      userId: session.user.id,
      connectedAccountId: status.connectedAccountId,
      arguments: createMediaArguments,
    });
  } catch (error) {
    const raw = {
      message:
        error instanceof Error ? error.message : "Unknown create media error.",
      schema: createSchema,
    };

    return failure(
      "create_media",
      rawLooksLikeStagedFileError(raw) ? STAGED_FILE_ERROR : raw.message,
      raw,
    );
  }

  if (isToolFailure(createRaw)) {
    return failure(
      "create_media",
      rawLooksLikeStagedFileError(createRaw)
        ? STAGED_FILE_ERROR
        : getToolError(createRaw, "Instagram create media failed."),
      createRaw,
    );
  }

  const creationId = extractMediaId(createRaw);
  if (!creationId) {
    return failure(
      "create_media",
      "Create media succeeded but no creation/container ID was found in the response.",
      createRaw,
    );
  }

  const publishMediaArguments = removeUndefined({
    ig_user_id: resolvedAccountInfo.igUserId,
    creation_id: creationId,
    media_id: creationId,
  });

  let publishRaw: unknown;
  try {
    publishRaw = await executeInstagramTool({
      composio,
      toolSlug: publishMediaToolSlug,
      userId: session.user.id,
      connectedAccountId: status.connectedAccountId,
      arguments: publishMediaArguments,
    });
  } catch (error) {
    return failure(
      "publish_media",
      error instanceof Error ? error.message : "Unknown publish media error.",
      {
        create: createRaw,
      },
    );
  }

  if (isToolFailure(publishRaw)) {
    return failure(
      "publish_media",
      getToolError(publishRaw, "Instagram publish media failed."),
      {
        create: createRaw,
        publish: publishRaw,
      },
    );
  }

  const permalink = extractPermalink(publishRaw);
  if (!permalink) {
    return failure(
      "publish_media",
      "Instagram publish media succeeded but no permalink was returned.",
      {
        create: createRaw,
        publish: publishRaw,
      },
    );
  }

  return Response.json({
    success: true,
    igUserId: resolvedAccountInfo.igUserId,
    instagramUsername: resolvedAccountInfo.instagramUsername,
    facebookPageId: resolvedAccountInfo.facebookPageId,
    mediaId: creationId,
    permalink,
    raw: {
      create: createRaw,
      publish: publishRaw,
    },
  });
}
