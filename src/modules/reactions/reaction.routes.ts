import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { createReactionSchema, updateReactionSchema } from "./reaction.schemas.js";
import { addReaction, allReactions, editReaction, ReactionNotFoundError, activeReactions } from "./reaction.service.js";

const sessionCookie = "netin_session";

export async function registerReactionRoutes(app: FastifyInstance, database: Database) {
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

  app.get("/reactions", async () => ({ reactions: await activeReactions(database) }));

  app.get("/admin/reactions", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    return { reactions: await allReactions(database) };
  });

  app.post("/admin/reactions", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    return reply.code(201).send({ reaction: await addReaction(database, createReactionSchema.parse(request.body)) });
  });

  app.patch("/admin/reactions/:reactionId", async (request, reply) => {
    if (!await administrator(request, reply)) return;
    try {
      return { reaction: await editReaction(database, (request.params as { reactionId: string }).reactionId, updateReactionSchema.parse(request.body)) };
    } catch (error) {
      if (error instanceof ReactionNotFoundError) return reply.code(404).send({ error: "reaction_not_found" });
      throw error;
    }
  });
}
