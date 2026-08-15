import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerDeviceRoutes } from "./modules/devices/device.routes.js";
import { createMqttProvisioner } from "./modules/devices/mqtt-provisioner.js";
import { registerGroupRoutes } from "./modules/groups/group.routes.js";
import { registerSocialRoutes } from "./modules/social/social.routes.js";
import { registerStatusRoutes } from "./modules/status/status.routes.js";
import { registerMediaRoutes } from "./modules/media/media.routes.js";
import { createMediaStorage } from "./modules/media/media.storage.js";
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
  const mqttProvisioner = createMqttProvisioner(environment);
  // Keeps programmatic test environments compatible while .env always gets
  // the explicit default through the validated configuration.
  const mediaStorage = createMediaStorage(environment.MEDIA_STORAGE_PATH ?? "data/media");

  void app.register(cookie);
  void app.register(cors, {
    origin: environment.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  void app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024 } });

  app.get("/health", async () => ({ status: "ok" }));
  void app.register(async (instance) => {
    await registerAuthRoutes(instance, database, environment);
    await registerDeviceRoutes(instance, database, mqttProvisioner);
    await registerGroupRoutes(instance, database);
    await registerSocialRoutes(instance, database, statusSynchronizer);
    await registerStatusRoutes(instance, database, statusSynchronizer);
    await registerMediaRoutes(instance, database, mediaStorage, statusSynchronizer);
  });

  app.addHook("onReady", async () => { statusSynchronizer.start(); });

  app.addHook("onClose", async () => {
    await statusSynchronizer.stop();
    await databaseConnection.close();
  });

  return app;
}
