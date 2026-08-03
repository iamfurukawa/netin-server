import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";

test("GET /health returns the service status", async () => {
  const app = createApp({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    DATABASE_URL: "postgres://netin:netin@localhost:5432/netin",
    CORS_ORIGIN: "http://localhost:5173",
  });

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
  await app.close();
});
