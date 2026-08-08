import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { sendGroupInteractionSchema, socialPreferencesSchema } from "./social.schemas.js";
import { GroupMembershipRequiredError, preferencesForUser, sendGroupInteraction, SocialGroupNotFoundError, updatePreferences } from "./social.service.js";

const sessionCookie = "netin_session";

export async function registerSocialRoutes(app: FastifyInstance, database: Database) {
  async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    return user;
  }

  app.get("/social-preferences", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    return preferencesForUser(database, user.id);
  });

  app.put("/social-preferences", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    return updatePreferences(database, user.id, socialPreferencesSchema.parse(request.body).muted);
  });

  app.post("/groups/:groupId/interactions", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const interaction = await sendGroupInteraction(database, user.id, (request.params as { groupId: string }).groupId, sendGroupInteractionSchema.parse(request.body));
      return reply.code(202).send(interaction);
    } catch (error) {
      if (error instanceof SocialGroupNotFoundError) return reply.code(404).send({ error: "group_not_found" });
      if (error instanceof GroupMembershipRequiredError) return reply.code(403).send({ error: "group_membership_required" });
      throw error;
    }
  });
}
