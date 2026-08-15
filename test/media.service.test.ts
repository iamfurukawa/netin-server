import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { normalizePhoto, UnsupportedMediaError } from "../src/modules/media/media.service.js";

test("normalizes an image into a Netin-sized JPEG with integrity metadata", async () => {
  const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#7560f5" } }).png().toBuffer();
  const photo = await normalizePhoto(original, "image/png");
  const metadata = await sharp(photo.content).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 240);
  assert.equal(metadata.height, 320);
  assert.equal(photo.width, 240);
  assert.equal(photo.height, 320);
  assert.match(photo.sha256, /^[a-f0-9]{64}$/);
});

test("rejects unsupported upload media types", async () => {
  await assert.rejects(() => normalizePhoto(Buffer.from("not an image"), "image/gif"), UnsupportedMediaError);
});
