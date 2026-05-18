import { getSession } from "auth/server";
import { createInstagramConnectionLinkForUser } from "@/lib/composio/composio-service";

export async function POST() {
  const session = await getSession();

  if (!session?.user?.id) {
    return Response.json(
      {
        ok: false,
        provider: "instagram",
        connectionUrl: null,
        connectedAccountId: null,
        status: "unauthorized",
        reason: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  const result = await createInstagramConnectionLinkForUser(session.user.id);

  const httpStatus = result.ok ? 200 : 400;

  return Response.json(result, { status: httpStatus });
}
