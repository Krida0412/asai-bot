/**
 * Download Image Tool — ported from python-engine intelligence_crew/tools/download_tool.py
 * Downloads images and stores them. In serverless (Vercel), uses fetch + stores URL reference.
 * For production, should use Vercel Blob or Cloudflare R2.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { pgDb as db } from "../../db/pg/db.pg";
import { TaskMediaAssetTable } from "../../db/pg/schema.pg";

// Module-level task context (set before graph execution)
let _currentTaskId: string | null = null;

export function setTaskContext(taskId: string) {
  _currentTaskId = taskId;
}

async function logMediaAsset(
  taskId: string,
  sourceUrl: string,
  localPath: string | null,
  fallbackUrl?: string,
  fmt?: string,
) {
  try {
    await db.insert(TaskMediaAssetTable).values({
      taskId,
      assetId: crypto.randomUUID(),
      originalUrl: sourceUrl,
      localPath,
      fallbackUrl: fallbackUrl ?? null,
      metadata: fmt ? { format: fmt } : null,
    });
  } catch (e) {
    console.warn("⚠️ Failed to log media asset:", e);
  }
}

export const downloadImageTool = new DynamicStructuredTool({
  name: "download_image",
  description:
    "Mengunduh gambar dari internet dan menyimpannya. Wajib digunakan jika pengguna atau Chief meminta aset foto/gambar.",
  schema: z.object({
    url: z.string().url().describe("URL dari gambar yang akan diunduh"),
  }),
  func: async ({ url }) => {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (_currentTaskId) {
          await logMediaAsset(_currentTaskId, url, null, url);
        }
        return `FAILED: HTTP ${response.status}. Use fallback public url: ${url}`;
      }

      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("image") &&
        !contentType.includes("octet-stream")
      ) {
        if (_currentTaskId) {
          await logMediaAsset(_currentTaskId, url, null, url);
        }
        return `FAILED: Not an image (${contentType}). Use fallback public url: ${url}`;
      }

      // Determine format
      let fmt = "jpg";
      if (contentType.includes("png")) fmt = "png";
      else if (contentType.includes("webp")) fmt = "webp";

      // In serverless, we can't persist files to disk.
      // Store the URL as fallback and mark as "fallback_url" status.
      // For production: upload to Vercel Blob here.
      if (_currentTaskId) {
        await logMediaAsset(_currentTaskId, url, null, url, fmt);
      }

      return `SUCCESS: Image verified (${fmt}). Stored as fallback URL: ${url}`;
    } catch (e: any) {
      if (_currentTaskId) {
        await logMediaAsset(_currentTaskId, url, null, url);
      }
      return `FAILED: ${e.message}. Use fallback public url: ${url}`;
    }
  },
});
