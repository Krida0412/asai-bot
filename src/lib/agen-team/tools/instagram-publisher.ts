import { publishInstagramFeedViaSession } from "@/lib/agen-team/tools/instagram-session-publisher";
import { getInstagramConnectedAccountStatusForUser } from "@/lib/composio/composio-service";
import { tool } from "ai";
import { z } from "zod";

const DEFAULT_PLACEHOLDER_IMAGE_URL = "https://placehold.co/1080x1080.jpg";

const INSTAGRAM_CAPTION_MAX_LENGTH = 900;
const INSTAGRAM_MAX_HASHTAGS = 3;
const INSTAGRAM_MAX_EMOJI = 2;
const EMOJI_REGEX = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu;

function cleanCaptionText(input?: string) {
  return (input ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s*/gm, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitEmoji(input: string, maxEmoji = INSTAGRAM_MAX_EMOJI) {
  let count = 0;
  return input
    .replace(EMOJI_REGEX, (match) => {
      count += 1;
      return count <= maxEmoji ? match : "";
    })
    .replace(/\uFE0F/g, "");
}

function normalizeHashtags(input: string) {
  const seen = new Set<string>();
  const hashtags: string[] = [];

  for (const match of input.match(/#[A-Za-z0-9_]+/g) ?? []) {
    const key = match.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hashtags.push(match);
    if (hashtags.length >= INSTAGRAM_MAX_HASHTAGS) break;
  }

  return hashtags;
}

function trimCaptionLength(
  caption: string,
  maxLength = INSTAGRAM_CAPTION_MAX_LENGTH,
) {
  if (caption.length <= maxLength) return caption;

  const sliced = caption.slice(0, maxLength).trim();
  const breakpoints = [
    sliced.lastIndexOf("\n\n"),
    sliced.lastIndexOf(". "),
    sliced.lastIndexOf("! "),
    sliced.lastIndexOf("? "),
  ].filter((index) => index > Math.floor(maxLength * 0.55));
  const bestBreak = Math.max(...breakpoints, -1);
  const trimmed =
    bestBreak > 0 ? sliced.slice(0, bestBreak + 1).trim() : sliced;

  return trimmed.replace(/[,.!?:;\-–—]+$/, "").trim();
}

function sanitizeInstagramCaptionForPublish(input: string) {
  const hashtags = normalizeHashtags(input);
  const withoutInlineHashtags = input
    .replace(/#[A-Za-z0-9_]+/g, "")
    .replace(/[ \t]+\n/g, "\n");
  const body = limitEmoji(cleanCaptionText(withoutInlineHashtags));
  const caption = [body, hashtags.join(" ")].filter(Boolean).join("\n\n");

  return trimCaptionLength(caption);
}

function safeJSONParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeInstagramImageUrl(input?: string | null): string {
  if (!input?.trim()) {
    return DEFAULT_PLACEHOLDER_IMAGE_URL;
  }

  try {
    const url = new URL(input.trim());

    if (url.protocol !== "https:") {
      return DEFAULT_PLACEHOLDER_IMAGE_URL;
    }

    if (url.hostname.toLowerCase() === "placehold.co") {
      return DEFAULT_PLACEHOLDER_IMAGE_URL;
    }

    url.hash = "";

    const pathname = url.pathname.toLowerCase();
    const looksLikeDirectImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(pathname);

    if (url.search) {
      if (!looksLikeDirectImage) {
        return DEFAULT_PLACEHOLDER_IMAGE_URL;
      }
      url.search = "";
    }

    return url.toString();
  } catch {
    return DEFAULT_PLACEHOLDER_IMAGE_URL;
  }
}

export async function publishInstagramFromPayload(payloadStr: string) {
  const payload = safeJSONParse(payloadStr);
  const userId = readString(payload, ["userId", "user_id"]);
  const caption = sanitizeInstagramCaptionForPublish(
    readString(payload, ["caption", "message", "text"]),
  );
  const postFormat = readString(payload, [
    "postFormat",
    "post_format",
    "format",
    "outputFormat",
    "output_format",
  ]).toLowerCase();
  const configuredFallback =
    process.env.AGEN_TEAM_DEFAULT_INSTAGRAM_IMAGE_URL?.trim();
  const imageUrl = normalizeInstagramImageUrl(
    readString(payload, ["imageUrl", "image_url", "mediaUrl", "media_url"]) ||
      configuredFallback ||
      DEFAULT_PLACEHOLDER_IMAGE_URL,
  );

  if (!userId) {
    return "PUBLISH_FAILED: missing authenticated user id.";
  }

  if (!caption) {
    return "PUBLISH_FAILED: missing Instagram caption.";
  }

  if (imageUrl.includes("?") || imageUrl.includes("#")) {
    return JSON.stringify({
      type: "instagram_publish_result",
      status: "failed",
      error:
        "Instagram image URL must be a direct HTTPS URL without query parameters.",
      errorReason:
        "Instagram image URL must be a direct HTTPS URL without query parameters.",
      imageUrl,
      caption,
      raw: {},
    });
  }

  if (postFormat.includes("carousel")) {
    return JSON.stringify({
      type: "instagram_publish_result",
      status: "failed",
      caption,
      imageUrl,
      error:
        "Carousel foto belum diaktifkan di publisher MVP. Feed foto + caption sudah didukung.",
      errorReason:
        "Carousel foto belum diaktifkan di publisher MVP. Feed foto + caption sudah didukung.",
      raw: {},
    });
  }

  const connectionStatus =
    await getInstagramConnectedAccountStatusForUser(userId);
  if (!connectionStatus.isConnected || !connectionStatus.connectedAccountId) {
    return JSON.stringify({
      type: "instagram_publish_result",
      status: "failed",
      caption,
      imageUrl,
      error: connectionStatus.reason || "Instagram account is not connected.",
      errorReason:
        connectionStatus.reason || "Instagram account is not connected.",
      raw: {
        connectionStatus,
      },
    });
  }

  const result = await publishInstagramFeedViaSession({
    userId,
    connectedAccountId: connectionStatus.connectedAccountId,
    caption,
    imageUrl,
  });

  if (!result.success) {
    return JSON.stringify({
      type: "instagram_publish_result",
      status: "failed",
      caption,
      imageUrl,
      error: result.error || "Instagram publish failed.",
      errorReason: result.error || "Instagram publish failed.",
      stage: result.stage,
      raw: result.raw,
    });
  }

  return JSON.stringify({
    type: "instagram_publish_result",
    status: "success",
    mediaId: result.mediaId,
    permalink: result.permalink ?? null,
    imageUrl,
    caption,
    igUserId: result.igUserId,
    instagramUsername: result.instagramUsername,
    creationId: result.creationId,
    publicationId: result.mediaId,
    publicationUrl: result.permalink ?? undefined,
    mediaContainerId: result.creationId,
    raw: result.raw,
  });
}

export const instagramPublisherTool = tool({
  description:
    "Publish a single-image Instagram post through Composio. Requires connected Instagram account and a public image URL. Falls back to a generated public placeholder image for MVP upload tests.",
  inputSchema: z.object({
    payloadStr: z.string(),
  }),
  execute: async ({ payloadStr }) => publishInstagramFromPayload(payloadStr),
});
