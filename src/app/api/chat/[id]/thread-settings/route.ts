import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { ChatThreadTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

/**
 * GET /api/chat/[id]/thread-settings
 *
 * Returns the memory-related settings for a thread:
 * { auto_summarize, dify_config, latest_summary }
 *
 * Used by the Memory & Knowledge Base settings panel in the UI.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const hasAccess = await chatRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const [thread] = await db
    .select({
      auto_summarize: ChatThreadTable.auto_summarize,
      dify_config: ChatThreadTable.dify_config,
      latest_summary: ChatThreadTable.latest_summary,
      summary_message_count: ChatThreadTable.summary_message_count,
    })
    .from(ChatThreadTable)
    .where(eq(ChatThreadTable.id, id));

  if (!thread) {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json(thread);
}
