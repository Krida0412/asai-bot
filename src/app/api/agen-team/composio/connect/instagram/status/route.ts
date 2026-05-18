import { getSession } from "auth/server";
import { getInstagramConnectedAccountStatusForUser } from "@/lib/composio/composio-service";

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return Response.json(
      {
        ok: false,
        provider: "instagram",
        isConnected: false,
        connectedAccountId: null,
        status: "unauthorized",
        reason: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  const result = await getInstagramConnectedAccountStatusForUser(
    session.user.id,
  );

  const httpStatus = result.ok ? 200 : 400;

  return Response.json(result, { status: httpStatus });
}
