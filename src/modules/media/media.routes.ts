import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { authenticateDeviceCredential, DeviceAuthenticationError } from "../devices/device.service.js";
import { findActiveGroup, isGroupMember } from "../groups/group.repository.js";
import { createMediaAsset, createMediaDeliveriesForGroup, createMediaDeliveriesForUser, createMediaEvent, deleteMediaAssets, expiredMediaAssets, mediaAssetById, mediaAssetForDeviceDelivery, mediaAssetForOwner, mediaStorageOverview } from "./media.repository.js";
import { sendMediaSchema } from "./media.schemas.js";
import { MediaProcessingError, MediaTooLargeError, normalizeMedia, UnsupportedMediaError } from "./media.service.js";
import type { MediaStorage } from "./media.storage.js";

const sessionCookie = "netin_session";
const mediaLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxOriginalMediaBytes = 10 * 1024 * 1024;
export type MediaDeliveryPublisher = { publishPendingMediaDeliveries(): Promise<void> };

async function giphyGif(giphyId: string) {
  if (!/^[a-zA-Z0-9]+$/.test(giphyId)) throw new UnsupportedMediaError();
  const response = await fetch(`https://media.giphy.com/media/${giphyId}/giphy.gif`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/gif")) throw new MediaProcessingError();
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxOriginalMediaBytes) throw new MediaTooLargeError();
  const reader = response.body?.getReader();
  if (!reader) throw new MediaProcessingError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxOriginalMediaBytes) throw new MediaTooLargeError();
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function registerMediaRoutes(app: FastifyInstance, database: Database, storage: MediaStorage, publisher?: MediaDeliveryPublisher) {
  async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    return user;
  }

  async function administrator(request: FastifyRequest, reply: FastifyReply) {
    const user = await authenticatedUser(request, reply);
    if (!user) return null;
    if (!user.isAdmin) {
      reply.code(403).send({ error: "admin_required" });
      return null;
    }
    return user;
  }

  app.get("/admin/storage/media", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    const overview = await mediaStorageOverview(database);
    return {
      count: overview.count,
      totalBytes: overview.totalBytes,
      assets: overview.assets.map((asset) => ({ ...asset, expired: asset.expiresAt <= new Date() })),
    };
  });

  app.get("/admin/storage/media/:assetId/preview", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    const asset = await mediaAssetById(database, (request.params as { assetId: string }).assetId);
    if (!asset || asset.processingState !== "ready") return reply.code(404).send({ error: "media_not_found" });
    reply.type(asset.processedMimeType).header("Content-Length", asset.sizeBytes).header("Cache-Control", "private, no-store");
    return reply.send(storage.stream(asset.storageKey));
  });

  app.post("/admin/storage/media/purge-expired", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    const assets = await expiredMediaAssets(database);
    for (const asset of assets) await storage.remove(asset.storageKey);
    await deleteMediaAssets(database, assets.map((asset) => asset.id));
    return { removed: assets.length, reclaimedBytes: assets.reduce((total, asset) => total + asset.sizeBytes, 0) };
  });

  app.post("/media/photos", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: "media_file_required" });
    try {
      const original = await upload.toBuffer();
      const media = await normalizeMedia(original, upload.mimetype);
      const storageKey = `${randomUUID()}${media.mimeType === "image/gif" ? ".gif" : ".jpg"}`;
      await storage.put(storageKey, media.content);
      try {
        const asset = await createMediaAsset(database, {
          ownerUserId: user.id,
          originalMimeType: upload.mimetype,
          processedMimeType: media.mimeType,
          width: media.width,
          height: media.height,
          sizeBytes: media.content.length,
          sha256: media.sha256,
          storageKey,
          processingState: "ready",
          expiresAt: new Date(Date.now() + mediaLifetimeMs),
        });
        return reply.code(201).send({ asset: {
          id: asset.id, kind: asset.processedMimeType, width: asset.width, height: asset.height,
          size: asset.sizeBytes, sha256: asset.sha256, state: asset.processingState, createdAt: asset.createdAt,
          downloadPath: `/media/${asset.id}/download`,
        } });
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    } catch (error) {
      if (error instanceof UnsupportedMediaError) return reply.code(415).send({ error: "unsupported_media_type" });
      if (error instanceof MediaTooLargeError) return reply.code(413).send({ error: "media_too_large" });
      if (error instanceof MediaProcessingError) return reply.code(422).send({ error: "invalid_media" });
      throw error;
    }
  });

  app.post("/media/giphy/:giphyId", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const original = await giphyGif((request.params as { giphyId: string }).giphyId);
      const media = await normalizeMedia(original, "image/gif");
      const storageKey = `${randomUUID()}.gif`;
      await storage.put(storageKey, media.content);
      try {
        const asset = await createMediaAsset(database, {
          ownerUserId: user.id, originalMimeType: "image/gif", processedMimeType: media.mimeType,
          width: media.width, height: media.height, sizeBytes: media.content.length, sha256: media.sha256,
          storageKey, processingState: "ready", expiresAt: new Date(Date.now() + mediaLifetimeMs),
        });
        return reply.code(201).send({ asset: {
          id: asset.id, kind: asset.processedMimeType, width: asset.width, height: asset.height,
          size: asset.sizeBytes, sha256: asset.sha256, state: asset.processingState, createdAt: asset.createdAt,
          downloadPath: `/media/${asset.id}/download`,
        } });
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    } catch (error) {
      if (error instanceof UnsupportedMediaError) return reply.code(400).send({ error: "invalid_giphy_gif" });
      if (error instanceof MediaTooLargeError) return reply.code(413).send({ error: "media_too_large" });
      if (error instanceof MediaProcessingError) return reply.code(422).send({ error: "invalid_giphy_gif" });
      throw error;
    }
  });

  app.get("/media/:assetId/download", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    const asset = await mediaAssetForOwner(database, (request.params as { assetId: string }).assetId, user.id);
    if (!asset || asset.processingState !== "ready" || asset.expiresAt <= new Date()) return reply.code(404).send({ error: "media_not_found" });
    reply.type(asset.processedMimeType).header("Content-Length", asset.sizeBytes).header("Cache-Control", "private, no-store");
    return reply.send(storage.stream(asset.storageKey));
  });

  app.post("/media/:assetId/send", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    const input = sendMediaSchema.parse(request.body);
    const asset = await mediaAssetForOwner(database, (request.params as { assetId: string }).assetId, user.id);
    if (!asset || asset.processingState !== "ready" || asset.expiresAt <= new Date()) return reply.code(404).send({ error: "media_not_found" });
    if (!await findActiveGroup(database, input.groupId)) return reply.code(404).send({ error: "group_not_found" });
    if (!await isGroupMember(database, input.groupId, user.id)) return reply.code(403).send({ error: "group_membership_required" });
    if (input.targetUserId && (input.targetUserId === user.id || !await isGroupMember(database, input.groupId, input.targetUserId))) return reply.code(400).send({ error: "invalid_media_target" });
    const event = await createMediaEvent(database, {
      senderUserId: user.id, groupId: input.groupId, targetUserId: input.targetUserId, assetId: asset.id,
      protocolVersion: 1, expiresAt: new Date(Date.now() + mediaLifetimeMs),
    });
    const recipients = input.targetUserId
      ? await createMediaDeliveriesForUser(database, event.id, input.targetUserId)
      : await createMediaDeliveriesForGroup(database, event.id, input.groupId);
    await publisher?.publishPendingMediaDeliveries();
    return reply.code(202).send({ eventId: event.id, createdAt: event.createdAt, recipients, delivery: "pending_mqtt" });
  });

  app.get("/device/media/:assetId/download", async (request, reply) => {
    const deviceId = request.headers["x-netin-device-id"];
    const authorization = request.headers.authorization;
    const credential = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (typeof deviceId !== "string" || !credential) return reply.code(401).send({ error: "device_unauthenticated" });
    try {
      await authenticateDeviceCredential(database, deviceId, credential);
    } catch (error) {
      if (error instanceof DeviceAuthenticationError) return reply.code(401).send({ error: "device_unauthenticated" });
      throw error;
    }
    const asset = await mediaAssetForDeviceDelivery(database, (request.params as { assetId: string }).assetId, deviceId);
    if (!asset || asset.processingState !== "ready") return reply.code(404).send({ error: "media_not_found" });
    reply.type(asset.processedMimeType).header("Content-Length", asset.sizeBytes).header("Cache-Control", "private, no-store");
    return reply.send(storage.stream(asset.storageKey));
  });
}
