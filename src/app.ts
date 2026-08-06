import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import type { Environment } from "./config.js";
import { createDatabase, type DatabaseConnection } from "./db/client.js";

export function createApp(
  environment: Environment,
  databaseConnection: DatabaseConnection = createDatabase(environment),
) {
  const database = databaseConnection.db;
  const app = Fastify({ logger: true });

  void app.register(cookie);
  void app.register(cors, {
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));
  void app.register(async (instance) => {
    await registerAuthRoutes(instance, database, environment);
  });

  app.addHook("onClose", async () => {
    await databaseConnection.close();
  });

  return app;
}
