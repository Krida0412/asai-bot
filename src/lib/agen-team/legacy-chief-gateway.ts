import type { ChiefMessageResponse } from "@/lib/agen-team/schemas";

/**
 * Dev-only gateway for the deprecated LangChain Chief router.
 *
 * Active `src/app` routes import this helper instead of importing
 * `agents/chief-router` directly, so production route surfaces cannot
 * accidentally bypass Agentic Chief v3. Callers must still guard with
 * `AGEN_TEAM_LEGACY_API_ENABLED=true` before invoking this helper.
 */
export async function handleLegacyChiefConversation(
  userId: string,
  message: string,
  sessionId?: string,
): Promise<ChiefMessageResponse> {
  if (process.env.AGEN_TEAM_LEGACY_API_ENABLED !== "true") {
    console.warn("legacy chief router called without flag");
    return {
      messageText:
        "Chief legacy router sudah dinonaktifkan. Gunakan Chief Chat v3.",
      options: [],
      state: "Deprecated",
      requiresAction: false,
    };
  }

  const { handleChiefConversation } = await import(
    "@/lib/agen-team/agents/chief-router"
  );
  return handleChiefConversation(userId, message, sessionId);
}
