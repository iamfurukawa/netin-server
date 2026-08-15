import { createHash } from "node:crypto";
import sharp from "sharp";

export const maxOriginalPhotoBytes = 10 * 1024 * 1024;
export const maxProcessedPhotoBytes = 150 * 1024;

export class UnsupportedMediaError extends Error {}
export class MediaTooLargeError extends Error {}
export class MediaProcessingError extends Error {}

export type ProcessedPhoto = {
  content: Buffer;
  width: number;
  height: number;
  sha256: string;
};

export async function normalizePhoto(content: Buffer, mimeType: string): Promise<ProcessedPhoto> {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) throw new UnsupportedMediaError();
  if (content.length === 0 || content.length > maxOriginalPhotoBytes) throw new MediaTooLargeError();
  try {
    const image = sharp(content, { failOn: "error", limitInputPixels: 16_000_000 }).rotate().resize({
      width: 240,
      height: 320,
      fit: "contain",
      background: "#17151f",
    });
    // TJpg_Decoder on the ESP32 accepts baseline RGB JPEG reliably. Avoid
    // mozjpeg-specific optimizations and progressive scans in delivered media.
    const processed = await image.jpeg({ quality: 80, progressive: false, mozjpeg: false, chromaSubsampling: "4:2:0" }).toBuffer();
    if (processed.length > maxProcessedPhotoBytes) throw new MediaTooLargeError();
    const metadata = await sharp(processed).metadata();
    return {
      content: processed,
      width: metadata.width ?? 240,
      height: metadata.height ?? 320,
      sha256: createHash("sha256").update(processed).digest("hex"),
    };
  } catch (error) {
    if (error instanceof MediaTooLargeError) throw error;
    throw new MediaProcessingError();
  }
}
