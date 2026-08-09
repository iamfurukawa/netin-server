import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { updateStatusSchema } from "./status.contract.js";
import { currentStatus, updateStatusFromPwa } from "./status.service.js";
import type { StatusPublisher } from "./status_sync.js";

const sessionCookie = "netin_session";

export async function registerStatusRoutes(app: FastifyInstance, database: Database, publisher: StatusPublisher) {
  async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    return user;
  }

  app.get("/status", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    return { status: await currentStatus(database, user.id) };
  });

  app.put("/status", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    const result = await updateStatusFromPwa(database, user.id, updateStatusSchema.parse(request.body).status);
    if (!result.current) throw new Error("status_apply_failed");
    let queued = false;
    try {
      queued = await publisher.publishStatus(user.id, result.current);
    } catch (error) {
      app.log.warn({ err: error, userId: user.id }, "Status saved but could not be published to MQTT");
    }
    return { status: result.current, delivery: queued ? "queued" : "unavailable" };
  });
}
