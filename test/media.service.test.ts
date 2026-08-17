import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { normalizeMedia, UnsupportedMediaError } from "../src/modules/media/media.service.js";

test("normalizes an image into a Netin-sized JPEG with integrity metadata", async () => {
  const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#7560f5" } }).png().toBuffer();
  const photo = await normalizeMedia(original, "image/png");
  const metadata = await sharp(photo.content).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 240);
  assert.equal(metadata.height, 320);
  assert.equal(photo.width, 240);
  assert.equal(photo.height, 320);
  assert.equal(photo.mimeType, "image/jpeg");
  assert.match(photo.sha256, /^[a-f0-9]{64}$/);
});

test("rejects unsupported upload media types", async () => {
  await assert.rejects(() => normalizeMedia(Buffer.from("not an image"), "application/pdf"), UnsupportedMediaError);
});

test("normalizes GIF uploads into an ESP32-compatible GIF", async () => {
  const original = await sharp({ create: { width: 480, height: 400, channels: 3, background: "#7560f5" } }).gif().toBuffer();
  const media = await normalizeMedia(original, "image/gif");
  const metadata = await sharp(media.content, { animated: true }).metadata();
  assert.equal(metadata.format, "gif");
  assert.equal(media.mimeType, "image/gif");
  assert.ok(media.width <= 240);
  assert.ok(media.height <= 320);
});
