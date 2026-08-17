import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

export const maxOriginalMediaBytes = 10 * 1024 * 1024;
export const maxProcessedPhotoBytes = 150 * 1024;
export const maxProcessedGifBytes = 2 * 1024 * 1024;

export class UnsupportedMediaError extends Error {}
export class MediaTooLargeError extends Error {}
export class MediaProcessingError extends Error {}

const execFileAsync = promisify(execFile);
const videoExtensions: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

async function videoToGif(content: Buffer, mimeType: string) {
  const extension = videoExtensions[mimeType];
  if (!extension) throw new UnsupportedMediaError();
  const directory = await mkdtemp(join(tmpdir(), "netin-media-"));
  const input = join(directory, `source.${extension}`);
  const output = join(directory, "processed.gif");
  try {
    await writeFile(input, content, { mode: 0o600 });
    const filter = "fps=12,scale=240:320:force_original_aspect_ratio=decrease:flags=lanczos,pad=240:320:(ow-iw)/2:(oh-ih)/2:color=0x17151f,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3";
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-t", "8", "-an", "-filter_complex", filter, "-loop", "0", output], { timeout: 30_000 });
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export type ProcessedMedia = {
  content: Buffer;
  mimeType: "image/jpeg" | "image/gif";
  width: number;
  height: number;
  sha256: string;
};

export async function normalizeMedia(content: Buffer, mimeType: string): Promise<ProcessedMedia> {
  if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif", ...Object.keys(videoExtensions)]).has(mimeType)) throw new UnsupportedMediaError();
  if (content.length === 0 || content.length > maxOriginalMediaBytes) throw new MediaTooLargeError();
  try {
    if (mimeType in videoExtensions) {
      content = await videoToGif(content, mimeType);
      mimeType = "image/gif";
    }
    const source = sharp(content, { animated: mimeType === "image/gif", failOn: "error", limitInputPixels: 16_000_000 });
    const sourceMetadata = await source.metadata();
    if (mimeType === "image/gif") {
      const frames = sourceMetadata.pages ?? 1;
      const durationMs = (sourceMetadata.delay ?? []).reduce((total, delay) => total + delay, 0);
      if (frames > 96 || durationMs > 8_000) throw new MediaTooLargeError();
    }
    const image = source.rotate().resize({
      width: 240,
      height: 320,
      fit: "contain",
      background: "#17151f",
    });
    // TJpg_Decoder on the ESP32 accepts baseline RGB JPEG reliably. Avoid
    // mozjpeg-specific optimizations and progressive scans in delivered media.
    const isGif = mimeType === "image/gif";
    const processed = isGif
      ? await image.gif({ colours: 128, effort: 6, dither: 0 }).toBuffer()
      : await image.jpeg({ quality: 80, progressive: false, mozjpeg: false, chromaSubsampling: "4:2:0" }).toBuffer();
    if (processed.length > (isGif ? maxProcessedGifBytes : maxProcessedPhotoBytes)) throw new MediaTooLargeError();
    const metadata = await sharp(processed, { animated: isGif }).metadata();
    return {
      content: processed,
      mimeType: isGif ? "image/gif" : "image/jpeg",
      width: metadata.width ?? 240,
      height: isGif ? (metadata.pageHeight ?? metadata.height ?? 320) : (metadata.height ?? 320),
      sha256: createHash("sha256").update(processed).digest("hex"),
    };
  } catch (error) {
    if (error instanceof MediaTooLargeError || error instanceof UnsupportedMediaError) throw error;
    throw new MediaProcessingError();
  }
}
