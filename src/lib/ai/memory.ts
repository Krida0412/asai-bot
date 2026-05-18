import "server-only";

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { UIMessage } from "ai";
import { eq } from "drizzle-orm";

import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  UserMemoryTable,
  ChatThreadTable,
  ChatThreadEntity,
} from "@/lib/db/pg/schema.pg";

// ─── Cheap model selector ─────────────────────────────────────────────────────
// Pick the cheapest model available based on configured API keys.
function getCheapModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google("gemini-2.5-flash-lite");
  }
  if (process.env.MISTRAL_API_KEY) {
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
    return mistral("mistral-small-latest");
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4.1-mini");
  }
  // Last-resort fallback — will fail gracefully if no key is set
  return google("gemini-2.5-flash-lite");
}

// ─── 2A. getUserFacts ─────────────────────────────────────────────────────────
/**
 * Returns a formatted bullet-list of all known facts about the user,
 * or an empty string when none exist.
 */
export async function getUserFacts(userId: string): Promise<string> {
  try {
    const facts = await db
      .select()
      .from(UserMemoryTable)
      .where(eq(UserMemoryTable.userId, userId));

    if (facts.length === 0) return "";

    return facts
      .map((f) => `- [${f.category}] ${f.fact_content}`)
      .join("\n");
  } catch (err) {
    console.error("[memory] getUserFacts error:", err);
    return "";
  }
}

// ─── 2B. saveFact ─────────────────────────────────────────────────────────────
/**
 * Extracts new personal facts from a single conversation turn and persists them.
 * Silently no-ops on any error — must never throw.
 */
export async function saveFact(
  userId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  try {
    const model = getCheapModel();

    const { text } = await generateText({
      model,
      prompt: `Extract ONLY new personal facts about the user from this conversation turn.
Return a JSON array ONLY, no explanation:
[{ "fact_content": "...", "category": "thesis|personal|academic|preference|other" }]
Return [] if no new facts.

User message: ${userMessage}
Assistant response: ${assistantResponse}`,
    });

    let extracted: { fact_content: string; category: string }[] = [];
    try {
      // Strip potential markdown code fences before parsing
      const cleaned = text.replace(/```(?:json)?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        extracted = parsed;
      }
    } catch {
      // Malformed JSON — skip silently
      return;
    }

    if (extracted.length === 0) return;

    // Fetch existing facts for near-duplicate detection
    const existing = await db
      .select({ fact_content: UserMemoryTable.fact_content })
      .from(UserMemoryTable)
      .where(eq(UserMemoryTable.userId, userId));

    const existingLower = existing.map((e) =>
      e.fact_content.toLowerCase().trim(),
    );

    const toInsert = extracted.filter((fact) => {
      if (!fact.fact_content || !fact.category) return false;
      const normalized = fact.fact_content.toLowerCase().trim();
      // Skip near-duplicates (simple substring check)
      return !existingLower.some(
        (ex) =>
          ex.includes(normalized) ||
          normalized.includes(ex),
      );
    });

    if (toInsert.length === 0) return;

    await db.insert(UserMemoryTable).values(
      toInsert.map((f) => ({
        userId,
        fact_content: f.fact_content,
        category: f.category,
      })),
    );
  } catch (err) {
    console.error("[memory] saveFact error:", err);
  }
}

// ─── 2C. generateSummaryIfNecessary ──────────────────────────────────────────
/**
 * Compresses older messages into a rolling summary stored on the thread row.
 * Triggers when messages.length >= 20 AND messages.length % 20 === 0.
 * Silently no-ops on any error — must never throw.
 */
export async function generateSummaryIfNecessary(
  threadId: string,
  messages: UIMessage[],
  autoSummarize: boolean,
): Promise<void> {
  try {
    if (!autoSummarize) return;
    if (messages.length < 20) return;
    if (messages.length % 20 !== 0) return;

    // Summarize everything except the last 10 messages (keep them as live context)
    const toSummarize = messages.slice(0, messages.length - 10);

    // Fetch the existing rolling summary
    const [thread] = await db
      .select({ latest_summary: ChatThreadTable.latest_summary })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, threadId));

    const priorSummary = thread?.latest_summary ?? null;

    const historyText = toSummarize
      .map((m) => {
        const content = m.parts?.map((p: any) => p.text || "").join(" ");
        return `${m.role}: ${content}`;
      })
      .join("\n");

    const preamble = priorSummary
      ? `Previous summary:\n${priorSummary}\n\nNew conversation to incorporate:\n`
      : "";

    const model = getCheapModel();

    const { text: newSummary } = await generateText({
      model,
      prompt: `Summarize this conversation history into 1-2 dense paragraphs.
Focus on: topics discussed, decisions made, user's thesis/academic context, and any conclusions reached.
Write in third person. Be specific, not generic.

${preamble}Conversation:
${historyText}`,
    });

    await db
      .update(ChatThreadTable)
      .set({
        latest_summary: newSummary.trim(),
        summary_message_count: messages.length - 10,
      })
      .where(eq(ChatThreadTable.id, threadId));
  } catch (err) {
    console.error("[memory] generateSummaryIfNecessary error:", err);
  }
}

// ─── 2D. buildMemoryContext ───────────────────────────────────────────────────
/**
 * Single entry point called from the chat route.
 * Returns facts and the latest rolling summary in parallel.
 */
export async function buildMemoryContext(
  userId: string,
  thread: Pick<ChatThreadEntity, "id" | "latest_summary">,
): Promise<{ facts: string; summary: string }> {
  const [facts] = await Promise.all([getUserFacts(userId)]);

  const summary = thread.latest_summary ?? "";

  return { facts, summary };
}
