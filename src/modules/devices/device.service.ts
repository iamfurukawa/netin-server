import { createHash, randomBytes } from "node:crypto";

import type { Database } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../auth/auth.service.js";
import { createDevice, findDevice, listDevicesForOwner, pairDeviceByCode, replacePairingCode, setDeviceCredential, unpairDevice } from "./device.repository.js";

const pairingCodeLifetimeMs = 10 * 60 * 1000;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class DeviceAuthenticationError extends Error {}
export class DeviceAlreadyPairedError extends Error {}
export class PairingCodeError extends Error {}
export class DeviceNotPairedError extends Error {}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("base64url");
}

function hashCredential(credential: string) {
  return createHash("sha256").update(credential).digest("base64url");
}

function createPairingCode() {
  const bytes = randomBytes(8);
  const characters = [...bytes].map((value) => alphabet[value % alphabet.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

async function authenticateDevice(database: Database, deviceId: string, bootstrapSecret: string) {
  const device = await findDevice(database, deviceId);
  if (!device || !(await verifyPassword(bootstrapSecret, device.bootstrapSecretHash))) {
    throw new DeviceAuthenticationError();
  }
  return device;
}

export async function registerDevice(database: Database, input: { deviceId: string; bootstrapSecret: string; hardwareTarget: string }) {
  const existing = await findDevice(database, input.deviceId);
  if (existing) {
    await authenticateDevice(database, input.deviceId, input.bootstrapSecret);
    return existing;
  }
  return createDevice(database, {
    id: input.deviceId,
    hardwareTarget: input.hardwareTarget,
    bootstrapSecretHash: await hashPassword(input.bootstrapSecret),
  });
}

export async function issuePairingCode(database: Database, input: { deviceId: string; bootstrapSecret: string }) {
  const device = await authenticateDevice(database, input.deviceId, input.bootstrapSecret);
  if (device.ownerUserId) throw new DeviceAlreadyPairedError();
  const code = createPairingCode();
  const expiresAt = new Date(Date.now() + pairingCodeLifetimeMs);
  await replacePairingCode(database, device.id, hashCode(code), expiresAt);
  return { code, expiresAt };
}

export async function pairingStatus(database: Database, input: { deviceId: string; bootstrapSecret: string }) {
  const device = await authenticateDevice(database, input.deviceId, input.bootstrapSecret);
  return { paired: Boolean(device.ownerUserId) };
}

export async function issueDeviceCredential(database: Database, input: { deviceId: string; bootstrapSecret: string }) {
  const device = await authenticateDevice(database, input.deviceId, input.bootstrapSecret);
  if (!device.ownerUserId) throw new DeviceNotPairedError();
  const credential = randomBytes(32).toString("base64url");
  await setDeviceCredential(database, device.id, hashCredential(credential));
  return { credential };
}

export async function pairDevice(database: Database, ownerUserId: string, code: string) {
  const device = await pairDeviceByCode(database, ownerUserId, hashCode(code));
  if (!device) throw new PairingCodeError();
  return device;
}

export async function listDevices(database: Database, ownerUserId: string) {
  return listDevicesForOwner(database, ownerUserId);
}

export async function removeDevice(database: Database, ownerUserId: string, deviceId: string) {
  const device = await unpairDevice(database, ownerUserId, deviceId);
  if (!device) throw new PairingCodeError();
}
