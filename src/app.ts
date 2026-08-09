import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerDeviceRoutes } from "./modules/devices/device.routes.js";
import { registerGroupRoutes } from "./modules/groups/group.routes.js";
import { registerSocialRoutes } from "./modules/social/social.routes.js";
import { registerStatusRoutes } from "./modules/status/status.routes.js";
import { createStatusSynchronizer } from "./modules/status/status_sync.js";
import type { Environment } from "./config.js";
import { createDatabase, type DatabaseConnection } from "./db/client.js";

export function createApp(
  environment: Environment,
  databaseConnection: DatabaseConnection = createDatabase(environment),
) {
  const database = databaseConnection.db;
  const app = Fastify({ logger: true });
  const statusSynchronizer = createStatusSynchronizer(environment, database, app.log);

  void app.register(cookie);
  void app.register(cors, {
    origin: environment.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.get("/health", async () => ({ status: "ok" }));
  void app.register(async (instance) => {
    await registerAuthRoutes(instance, database, environment);
    await registerDeviceRoutes(instance, database);
    await registerGroupRoutes(instance, database);
    await registerSocialRoutes(instance, database);
    await registerStatusRoutes(instance, database, statusSynchronizer);
  });

  app.addHook("onReady", async () => { statusSynchronizer.start(); });

  app.addHook("onClose", async () => {
    await statusSynchronizer.stop();
    await databaseConnection.close();
  });

  return app;
}
