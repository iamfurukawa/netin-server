import cors from "@fastify/cors";
import Fastify from "fastify";

import type { Environment } from "./config.js";

export function createApp(environment: Environment) {
  const app = Fastify({ logger: true });

  void app.register(cors, {
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
