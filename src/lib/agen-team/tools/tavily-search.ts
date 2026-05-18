/**
 * Tavily Search Tools — for independent fact-checking (Maya)
 * and enhanced web search (Dimas fallback / primary).
 *
 * Uses @tavily/core SDK directly for full output control.
 * Requires TAVILY_API_KEY environment variable.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

function getTavilyApiKey(): string | null {
  return process.env.TAVILY_API_KEY?.trim() || null;
}

async function createTavilyClient() {
  const apiKey = getTavilyApiKey();
  if (!apiKey) return null;
  const { tavily } = await import("@tavily/core");
  return tavily({ apiKey });
}

/**
 * Tavily fact-check tool — used by Maya (QA) for independent verification.
 * Searches with advanced depth to cross-reference claims.
 */
export const tavilyFactCheckTool = new DynamicStructuredTool({
  name: "tavily_fact_check",
  description:
    "Melakukan pencarian mendalam untuk verifikasi fakta secara independen. Gunakan untuk mengecek apakah klaim dari riset benar-benar didukung oleh sumber lain.",
  schema: z.object({
    claim: z.string().describe("Klaim yang ingin diverifikasi"),
    query: z
      .string()
      .describe("Kueri pencarian untuk memverifikasi klaim tersebut"),
  }),
  func: async ({ claim, query }) => {
    try {
      const client = await createTavilyClient();
      if (!client) {
        return `TAVILY_UNAVAILABLE: TAVILY_API_KEY belum dikonfigurasi. Klaim "${claim}" tidak bisa diverifikasi secara independen.`;
      }

      const response = await client.search(query, {
        searchDepth: "advanced",
        maxResults: 3,
        includeAnswer: true,
      });

      const answer = typeof response.answer === "string" ? response.answer : "";
      const results = Array.isArray(response.results) ? response.results : [];

      const sourceSnippets = results
        .slice(0, 3)
        .map(
          (r: { title?: string; url?: string; content?: string }) =>
            `Source: ${r.title ?? "Untitled"}\nURL: ${r.url ?? ""}\nSnippet: ${(r.content ?? "").slice(0, 400)}`,
        )
        .join("\n---\n");

      return [
        `CLAIM: ${claim}`,
        `TAVILY_ANSWER: ${answer || "Tidak ada ringkasan otomatis."}`,
        `SOURCES_FOUND: ${results.length}`,
        sourceSnippets || "Tidak ada sumber ditemukan.",
      ].join("\n\n");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `TAVILY_ERROR: Verifikasi gagal — ${msg}. Klaim "${claim}" belum terverifikasi.`;
    }
  },
});

/**
 * Tavily web search tool — general-purpose search for Dimas.
 * Can be used as primary alongside Exa.
 */
export const tavilyWebSearchTool = new DynamicStructuredTool({
  name: "tavily_web_search",
  description:
    "Melakukan pencarian web komprehensif untuk riset topik. Mengembalikan ringkasan dan sumber yang relevan.",
  schema: z.object({
    query: z.string().describe("Kueri pencarian web"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("Jumlah hasil maksimum"),
  }),
  func: async ({ query, numResults }) => {
    try {
      const client = await createTavilyClient();
      if (!client) {
        return "TAVILY_UNAVAILABLE: TAVILY_API_KEY belum dikonfigurasi. Gunakan exa_web_search sebagai alternatif.";
      }

      const response = await client.search(query, {
        searchDepth: "basic",
        maxResults: numResults,
        includeAnswer: true,
      });

      const answer = typeof response.answer === "string" ? response.answer : "";
      const results = Array.isArray(response.results) ? response.results : [];

      if (results.length === 0 && !answer) {
        return "Pencarian Tavily tidak menemukan hasil.";
      }

      const resultTexts = results
        .map(
          (r: { title?: string; url?: string; content?: string }) =>
            `Title: ${r.title ?? "Untitled"}\nURL: ${r.url ?? ""}\nSummary: ${(r.content ?? "").slice(0, 600)}\n---`,
        )
        .join("\n");

      return [answer ? `ANSWER: ${answer}` : "", resultTexts]
        .filter(Boolean)
        .join("\n\n");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `TAVILY_ERROR: Pencarian gagal — ${msg}`;
    }
  },
});

/**
 * Check if Tavily is available (API key configured).
 */
export function isTavilyAvailable(): boolean {
  return Boolean(getTavilyApiKey());
}
