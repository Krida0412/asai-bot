/**
 * Exa Search Tools — ported from python-engine intelligence_crew/tools/exa_search_tool.py
 * Provides web search and image search via Exa API.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import Exa from "exa-js";

/** Check if Exa API key is configured. */
export function isExaAvailable(): boolean {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

function getExaClient(): Exa {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY environment variable is missing");
  }
  return new Exa(apiKey);
}

export const exaWebSearchTool = new DynamicStructuredTool({
  name: "exa_web_search",
  description:
    "Melakukan pencarian di internet untuk riset topik dan mengembalikan cuplikan teks serta tautan sumbernya. Gunakan untuk mencari tren, berita, fakta, atau informasi tersembunyi.",
  schema: z.object({
    query: z
      .string()
      .describe('Teks kueri pencarian (misalnya: "Tren AI terbaru 2026")'),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("Jumlah hasil maksimum (batas 5)"),
  }),
  func: async ({ query, numResults }) => {
    try {
      const exa = getExaClient();
      const response = await exa.searchAndContents(query, {
        type: "auto",
        numResults,
        useAutoprompt: true,
        text: { includeHtmlTags: false, maxCharacters: 1500 },
      });

      const results = response.results.map(
        (res) =>
          `Title: ${res.title}\nURL: ${res.url}\nSummary: ${res.text}\n---\n`,
      );

      if (results.length === 0) {
        return "Pencarian tidak menemukan hasil.";
      }

      return results.join("\n");
    } catch (e: any) {
      return `Error executing Exa Search: ${e.message}`;
    }
  },
});

export const exaImageSearchTool = new DynamicStructuredTool({
  name: "exa_image_search",
  description:
    "Mencari gambar relevan di internet. Mengembalikan array URL gambar yang dapat Anda unduh menggunakan Download Image Tool.",
  schema: z.object({
    query: z
      .string()
      .describe(
        'Topik gambar (contoh: "high quality professional shot of artificial intelligence robot")',
      ),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("Jumlah gambar yang ingin dicari (batas 5)"),
  }),
  func: async ({ query, numResults }) => {
    try {
      const exa = getExaClient();
      const searchQuery = `site:unsplash.com OR site:pexels.com ${query} high resolution image`;

      const response = await exa.searchAndContents(searchQuery, {
        type: "neural",
        useAutoprompt: true,
        numResults,
        text: false as any,
      });

      const results = response.results.map(
        (res) => `Source URL: ${res.url}\nTitle: ${res.title}`,
      );

      if (results.length === 0) {
        return "Pencarian gambar tidak menemukan hasil.";
      }

      return (
        "Berikut adalah sumber gambar potensial (coba eksekusi Download Image Tool menggunakan Source URL, jika gagal gunakan fallback URL):\n" +
        results.join("\n")
      );
    } catch (e: any) {
      return `Error executing Exa Image Search: ${e.message}`;
    }
  },
});
