import { getSession } from "auth/server";
import { getComposioStatusForUser } from "@/lib/composio";

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return Response.json(
      {
        ok: false,
        status: "unauthorized",
        isConfigured: false,
        canExecuteActions: false,
        reason: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  const status = getComposioStatusForUser(session.user.id);

  return Response.json({
    ok: true,
    provider: "composio",
    ...status,
  });
}
