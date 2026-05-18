import fs from "fs/promises";
import path from "path";
import { Buffer } from "node:buffer";
import type { FileStorage, UploadContent, UploadOptions, UploadResult, FileMetadata } from "./file-storage.interface";
import { getContentTypeFromFilename, sanitizeFilename, toBuffer } from "./storage-utils";

export const createLocalFileStorage = (): FileStorage => {
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  const ensureUploadDir = async () => {
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
  };

  return {
    async upload(content: UploadContent, options?: UploadOptions): Promise<UploadResult> {
      await ensureUploadDir();
      
      const buffer = await toBuffer(content);
      const filename = options?.filename ? sanitizeFilename(options.filename) : `file-${Date.now()}`;
      
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const uniqueFilename = `${base}-${Date.now()}${ext}`;
      const contentType = options?.contentType || getContentTypeFromFilename(uniqueFilename);
      
      const filePath = path.join(uploadDir, uniqueFilename);
      await fs.writeFile(filePath, buffer);
      
      const key = uniqueFilename;
      const metadata: FileMetadata = {
        key,
        filename: uniqueFilename,
        contentType,
        size: buffer.length,
        uploadedAt: new Date(),
      };
      
      return {
        key,
        sourceUrl: `/uploads/${key}`,
        metadata,
      };
    },

    async download(key: string): Promise<Buffer> {
      const filePath = path.join(uploadDir, key);
      const data = await fs.readFile(filePath);
      return Buffer.from(data);
    },

    async delete(key: string): Promise<void> {
      const filePath = path.join(uploadDir, key);
      try {
        await fs.unlink(filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    },

    async exists(key: string): Promise<boolean> {
      const filePath = path.join(uploadDir, key);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async getMetadata(key: string): Promise<FileMetadata | null> {
      const filePath = path.join(uploadDir, key);
      try {
        const stats = await fs.stat(filePath);
        return {
          key,
          filename: key,
          contentType: getContentTypeFromFilename(key),
          size: stats.size,
          uploadedAt: stats.mtime,
        };
      } catch {
        return null;
      }
    },

    async getSourceUrl(key: string): Promise<string | null> {
      if (await this.exists(key)) {
        return `/uploads/${key}`;
      }
      return null;
    },
  };
};
