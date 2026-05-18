import { tool } from "ai";
import { z } from "zod";

/**
 * Factory that creates a Dify knowledge-base retrieval tool bound to a
 * specific dataset. Call this once per request using the thread's dify_config.
 *
 * @param apiKey     Dify dataset API key
 * @param datasetId  Dify dataset ID to query
 */
export function createDifyRetrievalTool(apiKey: string, datasetId: string) {
  return tool({
    description:
      "Search the academic knowledge base for relevant information from " +
      "uploaded documents, PDFs, thesis guidelines, and academic references. " +
      "Use this when the user asks about specific rules, procedures, or factual " +
      "content that might be in uploaded documents.",
    inputSchema: z.object({
      query: z.string().describe("The search query to find relevant documents"),
    }),
    execute: async ({ query }: { query: string }) => {
      try {
        const response = await fetch(
          `https://api.dify.ai/v1/datasets/${datasetId}/retrieve`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              retrieval_model: {
                search_method: "semantic_similarity",
                top_k: 3,
                score_threshold_enabled: true,
                score_threshold: 0.5,
              },
            }),
          },
        );

        if (!response.ok) {
          console.error(
            "[dify] retrieve failed:",
            response.status,
            response.statusText,
          );
          return "Knowledge base is currently unavailable.";
        }

        const data = await response.json();
        const records: any[] = data?.records ?? [];

        if (records.length === 0) {
          return "No relevant documents found for this query.";
        }

        return records
          .map(
            (r: any, i: number) =>
              `[Source ${i + 1}]: ${r.segment?.content ?? ""}`,
          )
          .join("\n\n");
      } catch (error) {
        console.error("[dify] retrieval error:", error);
        return "Knowledge base search failed. Answering from general knowledge.";
      }
    },
  });
}
