import type { FastifyInstance } from "fastify";

import type { Environment } from "../../config.js";
import type { Database } from "../../db/client.js";
import { AuthenticationError, currentUser, DuplicateEmailError, login, logout, register, toPublicUser, updateProfile } from "./auth.service.js";
import { credentialsSchema, registerSchema, updateProfileSchema } from "./auth.schemas.js";

const sessionCookie = "netin_session";

export async function registerAuthRoutes(app: FastifyInstance, database: Database, environment: Environment) {
  const cookieOptions = { httpOnly: true, path: "/", sameSite: "lax" as const, secure: environment.NODE_ENV === "production" };

  app.post("/auth/register", async (request, reply) => {
    try {
      const result = await register(database, registerSchema.parse(request.body));
      reply.setCookie(sessionCookie, result.session.token, { ...cookieOptions, expires: result.session.expiresAt });
      return reply.code(201).send({ user: toPublicUser(result.user) });
    } catch (error) {
      if (error instanceof DuplicateEmailError) return reply.code(409).send({ error: "email_already_registered" });
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    try {
      const result = await login(database, credentialsSchema.parse(request.body));
      reply.setCookie(sessionCookie, result.session.token, { ...cookieOptions, expires: result.session.expiresAt });
      return { user: toPublicUser(result.user) };
    } catch (error) {
      if (error instanceof AuthenticationError) return reply.code(401).send({ error: "invalid_credentials" });
      throw error;
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[sessionCookie];
    if (token) await logout(database, token);
    reply.clearCookie(sessionCookie, cookieOptions);
    return reply.code(204).send();
  });

  app.get("/auth/me", async (request, reply) => {
    const token = request.cookies[sessionCookie];
    if (!token) return reply.code(401).send({ error: "unauthenticated" });
    const user = await currentUser(database, token);
    if (!user) {
      reply.clearCookie(sessionCookie, cookieOptions);
      return reply.code(401).send({ error: "unauthenticated" });
    }
    return { user: toPublicUser(user) };
  });

  app.put("/auth/profile", async (request, reply) => {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    const updated = await updateProfile(database, user.id, updateProfileSchema.parse(request.body));
    return { user: toPublicUser(updated) };
  });
}
