import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { updateReactionSchema } from "./reaction.schemas.js";
import { addReaction, allReactions, editReaction, ReactionNotFoundError, activeReactions } from "./reaction.service.js";
import { MediaProcessingError, MediaTooLargeError, normalizeMedia, UnsupportedMediaError } from "../media/media.service.js";
import type { MediaStorage } from "../media/media.storage.js";
import { reactionById } from "./reaction.repository.js";

const sessionCookie = "netin_session";

export async function registerReactionRoutes(app: FastifyInstance, database: Database, storage: MediaStorage) {
  async function administrator(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    if (!user.isAdmin) {
      reply.code(403).send({ error: "admin_required" });
      return null;
    }
    return user;
  }

  const publicReaction = (reaction: Awaited<ReturnType<typeof reactionById>>) => reaction && ({
    id: reaction.id, name: reaction.name, displayOrder: reaction.displayOrder, isActive: reaction.isActive,
    assetKind: reaction.assetMimeType, assetPath: `/reactions/${reaction.id}/asset`,
  });

  app.get("/reactions", async () => ({ reactions: (await activeReactions(database)).map(publicReaction) }));

  app.get("/reactions/:reactionId/asset", async (request, reply) => {
    const reaction = await reactionById(database, (request.params as { reactionId: string }).reactionId);
    if (!reaction?.isActive || !reaction.assetStorageKey || !reaction.assetMimeType || !reaction.assetSizeBytes) return reply.code(404).send({ error: "reaction_asset_not_found" });
    reply.type(reaction.assetMimeType).header("Content-Length", reaction.assetSizeBytes).header("Cache-Control", "public, max-age=86400");
    return reply.send(storage.stream(reaction.assetStorageKey));
  });

  app.get("/admin/reactions", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    return { reactions: (await allReactions(database)).map(publicReaction) };
  });

  app.post("/admin/reactions", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: "reaction_asset_required" });
    try {
      const fields = upload.fields as Record<string, { value?: unknown } | undefined>;
      const name = String(fields.name?.value ?? "").trim();
      const displayOrder = Number(fields.displayOrder?.value ?? 0);
      if (!name || name.length > 32 || !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10_000) return reply.code(400).send({ error: "invalid_reaction" });
      const media = await normalizeMedia(await upload.toBuffer(), upload.mimetype);
      const storageKey = `${randomUUID()}${media.mimeType === "image/gif" ? ".gif" : ".jpg"}`;
      await storage.put(storageKey, media.content);
      try {
        const reaction = await addReaction(database, { name, displayOrder, isActive: true, assetMimeType: media.mimeType, assetSizeBytes: media.content.length, assetSha256: media.sha256, assetStorageKey: storageKey });
        return reply.code(201).send({ reaction: publicReaction(reaction) });
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    } catch (error) {
      if (error instanceof UnsupportedMediaError) return reply.code(415).send({ error: "unsupported_reaction_asset" });
      if (error instanceof MediaTooLargeError) return reply.code(413).send({ error: "reaction_asset_too_large" });
      if (error instanceof MediaProcessingError) return reply.code(422).send({ error: "invalid_reaction_asset" });
      throw error;
    }
  });

  app.patch("/admin/reactions/:reactionId", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    try {
      return { reaction: publicReaction(await editReaction(database, (request.params as { reactionId: string }).reactionId, updateReactionSchema.parse(request.body))) };
    } catch (error) {
      if (error instanceof ReactionNotFoundError) return reply.code(404).send({ error: "reaction_not_found" });
      throw error;
    }
  });

  app.put("/admin/reactions/:reactionId/asset", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    const current = await reactionById(database, (request.params as { reactionId: string }).reactionId);
    if (!current) return reply.code(404).send({ error: "reaction_not_found" });
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: "reaction_asset_required" });
    try {
      const media = await normalizeMedia(await upload.toBuffer(), upload.mimetype);
      const storageKey = `${randomUUID()}${media.mimeType === "image/gif" ? ".gif" : ".jpg"}`;
      await storage.put(storageKey, media.content);
      try {
        const reaction = await editReaction(database, current.id, { assetMimeType: media.mimeType, assetSizeBytes: media.content.length, assetSha256: media.sha256, assetStorageKey: storageKey });
        if (current.assetStorageKey) await storage.remove(current.assetStorageKey);
        return { reaction: publicReaction(reaction) };
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    } catch (error) {
      if (error instanceof UnsupportedMediaError) return reply.code(415).send({ error: "unsupported_reaction_asset" });
      if (error instanceof MediaTooLargeError) return reply.code(413).send({ error: "reaction_asset_too_large" });
      if (error instanceof MediaProcessingError) return reply.code(422).send({ error: "invalid_reaction_asset" });
      throw error;
    }
  });
}
