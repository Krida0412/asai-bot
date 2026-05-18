import { Composio } from "@composio/core";
import { getComposioApiKeyForServer } from "@/lib/composio/composio-service";

type PublishFailureStage =
  | "session_create"
  | "get_user_info"
  | "create_media"
  | "publish_media";

export async function publishInstagramFeedViaSession(params: {
  userId: string;
  connectedAccountId: string;
  imageUrl: string;
  caption: string;
}): Promise<{
  success: boolean;
  igUserId?: string;
  instagramUsername?: string;
  creationId?: string;
  mediaId?: string;
  permalink?: string | null;
  error?: string;
  stage?: PublishFailureStage;
  raw: {
    getUserInfo?: unknown;
    create?: unknown;
    publish?: unknown;
  };
}> {
  const apiKey = getComposioApiKeyForServer();
  if (!apiKey) {
    return {
      success: false,
      stage: "session_create",
      error: "COMPOSIO_API_KEY is not configured.",
      raw: {},
    };
  }

  const imageUrl = params.imageUrl.trim();
  const caption = params.caption.trim();

  if (!imageUrl.startsWith("https://")) {
    return {
      success: false,
      stage: "create_media",
      error: "Instagram publishing requires a public HTTPS image URL.",
      raw: {},
    };
  }

  if (!caption) {
    return {
      success: false,
      stage: "create_media",
      error: "Instagram publishing requires a non-empty caption.",
      raw: {},
    };
  }

  const composio = new Composio({ apiKey });

  let session: Awaited<ReturnType<typeof composio.create>>;
  try {
    session = await composio.create(params.userId, {
      toolkits: ["instagram"],
      connectedAccounts: {
        instagram: [params.connectedAccountId],
      },
      manageConnections: false,
    });
  } catch (error) {
    return {
      success: false,
      stage: "session_create",
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Composio session.",
      raw: {},
    };
  }

  const getUserInfo = await session.execute("INSTAGRAM_GET_USER_INFO", {});
  if (
    isRecord(getUserInfo) &&
    typeof getUserInfo.error === "string" &&
    getUserInfo.error.trim().length > 0
  ) {
    return {
      success: false,
      stage: "get_user_info",
      error: responseErrorMessage(
        getUserInfo,
        "INSTAGRAM_GET_USER_INFO returned an error.",
      ),
      raw: { getUserInfo },
    };
  }

  const igUserId = extractIgUserId(getUserInfo);
  const instagramUsername = extractInstagramUsername(getUserInfo);
  if (!igUserId) {
    return {
      success: false,
      stage: "get_user_info",
      error:
        "INSTAGRAM_GET_USER_INFO did not return a usable Instagram user ID.",
      raw: { getUserInfo },
    };
  }

  const createArgs = removeUndefined({
    ig_user_id: igUserId,
    image_url: imageUrl,
    caption,
  });

  const create = await session.execute(
    "INSTAGRAM_POST_IG_USER_MEDIA",
    createArgs,
  );
  if (
    isRecord(create) &&
    typeof create.error === "string" &&
    create.error.trim().length > 0
  ) {
    return {
      success: false,
      stage: "create_media",
      error: responseErrorMessage(
        create,
        "INSTAGRAM_POST_IG_USER_MEDIA returned an error.",
      ),
      igUserId,
      instagramUsername: instagramUsername ?? undefined,
      raw: { getUserInfo, create },
    };
  }

  const creationId = extractCreationId(create);
  if (!creationId) {
    return {
      success: false,
      stage: "create_media",
      error:
        "INSTAGRAM_POST_IG_USER_MEDIA did not return a creation/container ID.",
      igUserId,
      instagramUsername: instagramUsername ?? undefined,
      raw: { getUserInfo, create },
    };
  }

  const publishArgs = removeUndefined({
    ig_user_id: igUserId,
    creation_id: creationId,
  });

  let publish = await session.execute(
    "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
    publishArgs,
  );
  let retryPublish: typeof publish | null = null;

  if (
    isRecord(publish) &&
    typeof publish.error === "string" &&
    publish.error.trim().length > 0 &&
    isProcessingPublishError(publish)
  ) {
    await wait(5000);
    retryPublish = await session.execute(
      "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
      publishArgs,
    );

    if (
      !(
        isRecord(retryPublish) &&
        typeof retryPublish.error === "string" &&
        retryPublish.error.trim().length > 0
      )
    ) {
      publish = retryPublish;
    } else {
      return {
        success: false,
        stage: "publish_media",
        error: responseErrorMessage(
          retryPublish,
          "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH failed after one retry.",
        ),
        igUserId,
        instagramUsername: instagramUsername ?? undefined,
        creationId,
        raw: {
          getUserInfo,
          create,
          publish: {
            firstAttempt: publish,
            retryAttempt: retryPublish,
          },
        },
      };
    }
  }

  if (
    isRecord(publish) &&
    typeof publish.error === "string" &&
    publish.error.trim().length > 0
  ) {
    return {
      success: false,
      stage: "publish_media",
      error: responseErrorMessage(
        publish,
        "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH returned an error.",
      ),
      igUserId,
      instagramUsername: instagramUsername ?? undefined,
      creationId,
      raw: {
        getUserInfo,
        create,
        publish,
      },
    };
  }

  const mediaId = extractMediaId(publish);
  const permalink = extractPermalink(publish);

  return {
    success: true,
    igUserId,
    instagramUsername: instagramUsername ?? undefined,
    creationId,
    mediaId: mediaId ?? undefined,
    permalink,
    raw: {
      getUserInfo,
      create,
      publish,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNested(value: unknown, path: string[]): unknown {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function getFirstString(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const current = getNested(value, path);
    if (typeof current === "string" && current.trim().length > 0) {
      return current.trim();
    }
  }

  return null;
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

function removeUndefined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
}

function responseErrorMessage(raw: unknown, fallback: string) {
  if (isRecord(raw) && typeof raw.error === "string" && raw.error.trim()) {
    return raw.error.trim();
  }

  const strings = collectStrings(raw).filter(Boolean);
  return strings[0] ?? fallback;
}

function extractIgUserId(getUserInfo: unknown) {
  return getFirstString(getUserInfo, [
    ["data", "id"],
    ["id"],
    ["user_id"],
    ["ig_user_id"],
    ["instagram_business_account_id"],
    ["result", "data", "id"],
    ["result", "id"],
    ["response", "data", "id"],
    ["raw", "data", "id"],
  ]);
}

function extractInstagramUsername(getUserInfo: unknown) {
  return getFirstString(getUserInfo, [
    ["data", "username"],
    ["username"],
    ["result", "data", "username"],
    ["result", "username"],
  ]);
}

function extractCreationId(create: unknown) {
  return getFirstString(create, [
    ["data", "id"],
    ["id"],
    ["creation_id"],
    ["container_id"],
    ["result", "data", "id"],
    ["result", "id"],
    ["raw", "data", "id"],
  ]);
}

function extractMediaId(publish: unknown) {
  return getFirstString(publish, [
    ["data", "id"],
    ["id"],
    ["media_id"],
    ["result", "data", "id"],
    ["result", "id"],
  ]);
}

function extractPermalink(publish: unknown) {
  return getFirstString(publish, [
    ["data", "permalink"],
    ["permalink"],
    ["result", "data", "permalink"],
  ]);
}

function isProcessingPublishError(raw: unknown) {
  const text = collectStrings(raw).join(" ").toLowerCase();

  return (
    (text.includes("media") || text.includes("container")) &&
    (text.includes("not ready") ||
      text.includes("is not ready") ||
      text.includes("still processing") ||
      text.includes("processing") ||
      text.includes("try again"))
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
