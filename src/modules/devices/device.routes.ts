import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../../db/client.js";
import { currentUser } from "../auth/auth.service.js";
import { issuePairingCodeSchema, pairDeviceSchema, registerDeviceSchema } from "./device.schemas.js";
import { DeviceAlreadyPairedError, DeviceAuthenticationError, issuePairingCode, listDevices, PairingCodeError, pairDevice, registerDevice, removeDevice } from "./device.service.js";

const sessionCookie = "netin_session";

export async function registerDeviceRoutes(app: FastifyInstance, database: Database) {
  async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie];
    const user = token ? await currentUser(database, token) : null;
    if (!user) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    return user;
  }

  app.post("/device/register", async (request, reply) => {
    try {
      const device = await registerDevice(database, registerDeviceSchema.parse(request.body));
      return reply.code(201).send({ device: { id: device.id, hardwareTarget: device.hardwareTarget, paired: Boolean(device.ownerUserId) } });
    } catch (error) {
      if (error instanceof DeviceAuthenticationError) return reply.code(401).send({ error: "invalid_device_credentials" });
      throw error;
    }
  });

  app.post("/device/pairing-code", async (request, reply) => {
    try {
      const result = await issuePairingCode(database, issuePairingCodeSchema.parse(request.body));
      return { code: result.code, expiresAt: result.expiresAt.toISOString() };
    } catch (error) {
      if (error instanceof DeviceAuthenticationError) return reply.code(401).send({ error: "invalid_device_credentials" });
      if (error instanceof DeviceAlreadyPairedError) return reply.code(409).send({ error: "device_already_paired" });
      throw error;
    }
  });

  app.get("/devices", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    return { devices: await listDevices(database, user.id) };
  });

  app.post("/devices/pair", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      const device = await pairDevice(database, user.id, pairDeviceSchema.parse(request.body).code);
      return reply.code(201).send({ device: { id: device.id, hardwareTarget: device.hardwareTarget, pairedAt: device.pairedAt } });
    } catch (error) {
      if (error instanceof PairingCodeError) return reply.code(400).send({ error: "invalid_or_expired_pairing_code" });
      throw error;
    }
  });

  app.delete("/devices/:deviceId", async (request, reply) => {
    const user = await authenticatedUser(request, reply);
    if (!user) return;
    try {
      await removeDevice(database, user.id, (request.params as { deviceId: string }).deviceId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof PairingCodeError) return reply.code(404).send({ error: "device_not_found" });
      throw error;
    }
  });
}
