import { getSession } from "auth/server";
import { z } from "zod";
import { publishInstagramFeedViaSession } from "@/lib/agen-team/tools/instagram-session-publisher";
import { getInstagramConnectedAccountStatusForUser } from "@/lib/composio/composio-service";

const SessionPublishBodySchema = z.object({
  imageUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), {
      message: "imageUrl must be an HTTPS URL.",
    }),
  caption: z.string().trim().min(1, "caption is required."),
});

export async function POST(request: Request) {
  const authSession = await getSession();

  if (!authSession?.user?.id) {
    return Response.json(
      {
        success: false,
        stage: "session_create",
        error: "Unauthorized.",
        raw: null,
      },
      { status: 401 },
    );
  }

  const body = SessionPublishBodySchema.parse(await request.json());
  const connectionStatus = await getInstagramConnectedAccountStatusForUser(
    authSession.user.id,
  );

  if (!connectionStatus.ok || !connectionStatus.connectedAccountId) {
    return Response.json(
      {
        success: false,
        stage: "session_create",
        error:
          connectionStatus.reason ||
          "Instagram is not connected for the current user.",
        raw: connectionStatus,
      },
      { status: 400 },
    );
  }

  const result = await publishInstagramFeedViaSession({
    userId: authSession.user.id,
    connectedAccountId: connectionStatus.connectedAccountId,
    imageUrl: body.imageUrl,
    caption: body.caption,
  });

  return Response.json(result, {
    status: result.success
      ? 200
      : result.stage === "session_create"
        ? 500
        : 400,
  });
}
