/**
 * Memory Manager — ported from python-engine/app/utils/memory_manager.py
 * Loads and saves per-user Chief conversation context from Postgres.
 */
import { pgDb as db } from "../../db/pg/db.pg";
import { ChiefConversationMemoryTable } from "../../db/pg/schema.pg";
import { eq } from "drizzle-orm";

const MAX_MEMORY_CHARS = 8000; // ~2000 tokens

function trimToLimit(text: string, maxChars = MAX_MEMORY_CHARS): string {
  if (!text || text.length <= maxChars) return text;
  return "...[trimmed]...\n" + text.slice(-(maxChars - 20));
}

/**
 * Load compressed memory string for the given user.
 * Returns text block ready to be injected into the Chief system prompt.
 */
export async function loadChiefMemory(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(ChiefConversationMemoryTable)
    .where(eq(ChiefConversationMemoryTable.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const parts: string[] = [];

  if (row.condensedSummary) {
    const summary = trimToLimit(row.condensedSummary, MAX_MEMORY_CHARS / 2);
    parts.push(`[RINGKASAN PERCAKAPAN SEBELUMNYA]\n${summary}`);
  }

  if (row.extractedPreferences) {
    const prefs =
      typeof row.extractedPreferences === "string"
        ? JSON.parse(row.extractedPreferences)
        : (row.extractedPreferences as Record<string, unknown>);

    const prefLines = Object.entries(prefs).map(([k, v]) => `- ${k}: ${v}`);
    parts.push("[PREFERENSI YANG DIKETAHUI]\n" + prefLines.join("\n"));
  }

  if (parts.length === 0) return null;

  const combined = parts.join("\n\n");
  return trimToLimit(combined, MAX_MEMORY_CHARS);
}

/**
 * Upsert memory for the user.
 * Called after each successful task completion.
 */
export async function saveChiefMemory(
  userId: string,
  condensedSummary?: string,
  preferencesUpdate?: Record<string, unknown>,
): Promise<void> {
  // Load existing preferences to merge
  const existing = await db
    .select({
      extractedPreferences: ChiefConversationMemoryTable.extractedPreferences,
    })
    .from(ChiefConversationMemoryTable)
    .where(eq(ChiefConversationMemoryTable.userId, userId))
    .limit(1);

  let mergedPrefs: Record<string, unknown> = {};
  if (existing[0]?.extractedPreferences) {
    const ep = existing[0].extractedPreferences;
    mergedPrefs =
      typeof ep === "string" ? JSON.parse(ep) : (ep as Record<string, unknown>);
  }

  if (preferencesUpdate) {
    Object.assign(mergedPrefs, preferencesUpdate);
  }

  const trimmedSummary = condensedSummary
    ? trimToLimit(condensedSummary, MAX_MEMORY_CHARS)
    : undefined;

  // Upsert
  await db
    .insert(ChiefConversationMemoryTable)
    .values({
      userId,
      condensedSummary: trimmedSummary ?? null,
      extractedPreferences:
        Object.keys(mergedPrefs).length > 0 ? mergedPrefs : null,
    })
    .onConflictDoUpdate({
      target: ChiefConversationMemoryTable.userId,
      set: {
        condensedSummary: trimmedSummary ?? null,
        extractedPreferences:
          Object.keys(mergedPrefs).length > 0 ? mergedPrefs : null,
        lastContextUpdated: new Date(),
      },
    });
}
