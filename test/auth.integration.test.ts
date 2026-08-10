import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { Environment } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { eq } from "drizzle-orm";
import { devices, groupMembers, groups, pairingCodes, sessions, socialEvents, socialPreferences, statusEvents, userStatuses, users } from "../src/db/schema.js";

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
  await database.db.delete(statusEvents);
  await database.db.delete(userStatuses);
  await database.db.delete(socialEvents);
  await database.db.delete(socialPreferences);
  await database.db.delete(groupMembers);
  await database.db.delete(groups);
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

    const editedProfile = await app.inject({
      method: "PUT",
      url: "/auth/profile",
      headers: { cookie: registrationCookie },
      payload: { displayName: "Ana Nova", color: "#13579B" },
    });
    assert.equal(editedProfile.statusCode, 200);
    assert.equal(editedProfile.json().user.displayName, "Ana Nova");
    assert.equal(editedProfile.json().user.color, "#13579B");

    const ordinaryGroups = await app.inject({ method: "GET", url: "/groups", headers: { cookie: registrationCookie } });
    assert.equal(ordinaryGroups.statusCode, 200);
    assert.deepEqual(ordinaryGroups.json().groups, []);

    const forbiddenGroup = await app.inject({
      method: "POST", url: "/admin/groups", headers: { cookie: registrationCookie }, payload: { name: "Café" },
    });
    assert.equal(forbiddenGroup.statusCode, 403);

    await database.db.update(users).set({ isAdmin: true }).where(eq(users.id, registeredUser.id));
    const adminCookie = cookieFrom(await app.inject({
      method: "POST", url: "/auth/login", payload: { email: "ana@example.com", password: "correct-horse-battery-staple" },
    }));
    const createdGroup = await app.inject({
      method: "POST", url: "/admin/groups", headers: { cookie: adminCookie }, payload: { name: "Café", registrationsOpen: true },
    });
    assert.equal(createdGroup.statusCode, 201);
    const groupId = createdGroup.json().group.id;

    const joinedGroup = await app.inject({ method: "POST", url: `/groups/${groupId}/join`, headers: { cookie: registrationCookie } });
    assert.equal(joinedGroup.statusCode, 204);
    const groupsAfterJoin = await app.inject({ method: "GET", url: "/groups", headers: { cookie: registrationCookie } });
    assert.deepEqual(groupsAfterJoin.json().groups.map((group: { name: string; joined: boolean }) => ({ name: group.name, joined: group.joined })), [{ name: "Café", joined: true }]);

    const closedGroup = await app.inject({
      method: "PATCH", url: `/admin/groups/${groupId}`, headers: { cookie: adminCookie }, payload: { registrationsOpen: false },
    });
    assert.equal(closedGroup.statusCode, 200);
    const groupMembersResult = await app.inject({ method: "GET", url: `/admin/groups/${groupId}/members`, headers: { cookie: adminCookie } });
    assert.equal(groupMembersResult.statusCode, 200);
    assert.equal(groupMembersResult.json().members.length, 1);

    const preferences = await app.inject({ method: "GET", url: "/social-preferences", headers: { cookie: registrationCookie } });
    assert.deepEqual(preferences.json(), { muted: false });
    const muted = await app.inject({ method: "PUT", url: "/social-preferences", headers: { cookie: registrationCookie }, payload: { muted: true } });
    assert.equal(muted.statusCode, 200);
    assert.deepEqual(muted.json(), { muted: true });

    const reaction = await app.inject({
      method: "POST", url: `/groups/${groupId}/interactions`, headers: { cookie: registrationCookie }, payload: { type: "reaction", reaction: "🎉" },
    });
    assert.equal(reaction.statusCode, 202);
    assert.match(reaction.json().eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(reaction.json().delivery, "pending_mqtt");

    const emptyStatus = await app.inject({ method: "GET", url: "/status", headers: { cookie: registrationCookie } });
    assert.equal(emptyStatus.statusCode, 200);
    assert.deepEqual(emptyStatus.json(), { status: null });
    const availableStatus = await app.inject({ method: "PUT", url: "/status", headers: { cookie: registrationCookie }, payload: { status: "available" } });
    assert.equal(availableStatus.statusCode, 200);
    assert.equal(availableStatus.json().status.status, "available");
    assert.equal(availableStatus.json().status.globalVersion, 1);
    assert.equal(availableStatus.json().delivery, "unavailable");
    const busyStatus = await app.inject({ method: "PUT", url: "/status", headers: { cookie: registrationCookie }, payload: { status: "busy" } });
    assert.equal(busyStatus.statusCode, 200);
    assert.equal(busyStatus.json().status.status, "busy");
    assert.equal(busyStatus.json().status.globalVersion, 2);

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

    const pairingStatus = await app.inject({
      method: "POST",
      url: "/device/pairing-status",
      payload: { deviceId, bootstrapSecret },
    });
    assert.equal(pairingStatus.statusCode, 200);
    assert.deepEqual(pairingStatus.json(), { paired: true });

    const deviceCredential = await app.inject({
      method: "POST",
      url: "/device/credential",
      payload: { deviceId, bootstrapSecret },
    });
    assert.equal(deviceCredential.statusCode, 200);
    assert.match(deviceCredential.json().credential, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(deviceCredential.json().mqtt, null);

    const listed = await app.inject({ method: "GET", url: "/devices", headers: { cookie: registrationCookie } });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().devices.length, 1);
    assert.equal(listed.json().devices[0].hardwareTarget, "esp32-2432s024");

    const removed = await app.inject({ method: "DELETE", url: `/devices/${deviceId}`, headers: { cookie: registrationCookie } });
    assert.equal(removed.statusCode, 204);

    const revokedCredential = await app.inject({
      method: "POST",
      url: "/device/credential",
      payload: { deviceId, bootstrapSecret },
    });
    assert.equal(revokedCredential.statusCode, 409);
    assert.deepEqual(revokedCredential.json(), { error: "device_not_paired" });

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
