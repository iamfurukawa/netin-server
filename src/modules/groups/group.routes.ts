import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { createGroupSchema, updateGroupSchema } from "./group.schemas.js";
import { archiveGroup, createGroup, GroupClosedError, GroupForbiddenError, GroupNotFoundError, joinGroup, leaveGroup, listGroups, membersForInteraction, membersOfGroup, removeMember, updateGroup } from "./group.service.js";

const sessionCookie = "netin_session";

export async function registerGroupRoutes(app: FastifyInstance, database: Database) {
  async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    return user;
  }

  function groupError(error: unknown, reply: FastifyReply) {
    if (error instanceof GroupNotFoundError) return reply.code(404).send({ error: "group_not_found" });
    if (error instanceof GroupClosedError) return reply.code(409).send({ error: "group_registrations_closed" });
    if (error instanceof GroupForbiddenError) return reply.code(403).send({ error: "admin_required" });
    throw error;
  }

  app.get("/groups", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    return { groups: await listGroups(database, user.id) };
  });

  app.post("/groups/:groupId/join", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      await joinGroup(database, (request.params as { groupId: string }).groupId, user.id);
      return reply.code(204).send();
    } catch (error) { return groupError(error, reply); }
  });

  app.delete("/groups/:groupId/membership", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      await leaveGroup(database, (request.params as { groupId: string }).groupId, user.id);
      return reply.code(204).send();
    } catch (error) { return groupError(error, reply); }
  });

  app.get("/groups/:groupId/members", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      return { members: await membersForInteraction(database, user.id, (request.params as { groupId: string }).groupId) };
    } catch (error) { return groupError(error, reply); }
  });

  app.post("/admin/groups", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const group = await createGroup(database, user, createGroupSchema.parse(request.body));
      return reply.code(201).send({ group });
    } catch (error) { return groupError(error, reply); }
  });

  app.patch("/admin/groups/:groupId", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const group = await updateGroup(database, user, (request.params as { groupId: string }).groupId, updateGroupSchema.parse(request.body));
      return { group };
    } catch (error) { return groupError(error, reply); }
  });

  app.delete("/admin/groups/:groupId", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      await archiveGroup(database, user, (request.params as { groupId: string }).groupId);
      return reply.code(204).send();
    } catch (error) { return groupError(error, reply); }
  });

  app.get("/admin/groups/:groupId/members", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      return { members: await membersOfGroup(database, user, (request.params as { groupId: string }).groupId) };
    } catch (error) { return groupError(error, reply); }
  });

  app.delete("/admin/groups/:groupId/members/:userId", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const { groupId, userId } = request.params as { groupId: string; userId: string };
      await removeMember(database, user, groupId, userId);
      return reply.code(204).send();
    } catch (error) { return groupError(error, reply); }
  });
}
