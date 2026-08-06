import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { Environment } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { devices, pairingCodes, sessions, users } from "../src/db/schema.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }) {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  assert.ok(value, "expected a session cookie");
  return value.split(";", 1)[0];
}

test("authentication persists and revokes sessions", { skip: !testDatabaseUrl }, async () => {
  if (!testDatabaseUrl) return;

  const environment: Environment = {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    DATABASE_URL: testDatabaseUrl,
    CORS_ORIGIN: "http://localhost:5173",
  };
  await runMigrations(environment);

  const database = createDatabase(environment);
  await database.db.delete(pairingCodes);
  await database.db.delete(devices);
  await database.db.delete(sessions);
  await database.db.delete(users);
  const app = createApp(environment, database);

  try {
    const registered = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "  Ana@Example.com ",
        password: "correct-horse-battery-staple",
        displayName: "Ana",
        color: "#7560f5",
      },
    });
    assert.equal(registered.statusCode, 201);
    const registeredUser = registered.json().user;
    assert.match(registeredUser.id, /^[0-9a-f-]{36}$/i);
    assert.equal(registeredUser.email, "ana@example.com");
    assert.equal(registeredUser.displayName, "Ana");
    assert.equal(registeredUser.color, "#7560f5");
    const registrationCookie = cookieFrom(registered);
    assert.match(registrationCookie, /^netin_session=/);

    const currentUser = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: registrationCookie },
    });
    assert.equal(currentUser.statusCode, 200);
    assert.equal(currentUser.json().user.email, "ana@example.com");

    const deviceId = "7e8c3c74-faa2-40a9-8fa9-aa1c25c61c90";
    const bootstrapSecret = "D2cfyjmFtuvDDvhhxu1LFEDkaqUON9sHTA0hm1Bf";
    const deviceRegistration = await app.inject({
      method: "POST",
      url: "/device/register",
      payload: { deviceId, bootstrapSecret, hardwareTarget: "esp32-2432s024" },
    });
    assert.equal(deviceRegistration.statusCode, 201);

    const pairingCode = await app.inject({
      method: "POST",
      url: "/device/pairing-code",
      payload: { deviceId, bootstrapSecret },
    });
    assert.equal(pairingCode.statusCode, 200);
    assert.match(pairingCode.json().code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const paired = await app.inject({
      method: "POST",
      url: "/devices/pair",
      headers: { cookie: registrationCookie },
      payload: { code: pairingCode.json().code },
    });
    assert.equal(paired.statusCode, 201);
    assert.equal(paired.json().device.id, deviceId);

    const listed = await app.inject({ method: "GET", url: "/devices", headers: { cookie: registrationCookie } });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().devices.length, 1);
    assert.equal(listed.json().devices[0].hardwareTarget, "esp32-2432s024");

    const removed = await app.inject({ method: "DELETE", url: `/devices/${deviceId}`, headers: { cookie: registrationCookie } });
    assert.equal(removed.statusCode, 204);

    const duplicate = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "ana@example.com", password: "another-secure-password", displayName: "Outra" },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(duplicate.json(), { error: "email_already_registered" });

    const invalidLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ana@example.com", password: "wrong-password" },
    });
    assert.equal(invalidLogin.statusCode, 401);
    assert.deepEqual(invalidLogin.json(), { error: "invalid_credentials" });

    const loggedIn = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ana@example.com", password: "correct-horse-battery-staple" },
    });
    assert.equal(loggedIn.statusCode, 200);
    const loginCookie = cookieFrom(loggedIn);

    const loggedOut = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: loginCookie },
    });
    assert.equal(loggedOut.statusCode, 204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: loginCookie },
    });
    assert.equal(afterLogout.statusCode, 401);
  } finally {
    await app.close();
  }
});
