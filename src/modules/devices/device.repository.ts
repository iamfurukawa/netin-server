import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { devices, pairingCodes } from "../../db/schema.js";

export type DeviceRecord = typeof devices.$inferSelect;

export async function findDevice(database: Database, deviceId: string) {
  const [device] = await database.select().from(devices).where(eq(devices.id, deviceId));
  return device ?? null;
}

export async function findDeviceForOwner(database: Database, ownerUserId: string, deviceId: string) {
  const [device] = await database.select().from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.ownerUserId, ownerUserId)));
  return device ?? null;
}

export async function createDevice(database: Database, device: typeof devices.$inferInsert) {
  const [created] = await database.insert(devices).values(device).returning();
  return created;
}

export async function replacePairingCode(database: Database, deviceId: string, codeHash: string, expiresAt: Date) {
  await database.delete(pairingCodes).where(eq(pairingCodes.deviceId, deviceId));
  await database.insert(pairingCodes).values({ deviceId, codeHash, expiresAt });
}

export async function listDevicesForOwner(database: Database, ownerUserId: string) {
  return database.select({
    id: devices.id,
    hardwareTarget: devices.hardwareTarget,
    pairedAt: devices.pairedAt,
    lastSeenAt: devices.lastSeenAt,
    createdAt: devices.createdAt,
  }).from(devices).where(eq(devices.ownerUserId, ownerUserId));
}

export async function markDeviceSeen(database: Database, deviceId: string) {
  await database.update(devices).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(devices.id, deviceId));
}

export async function pairDeviceByCode(database: Database, ownerUserId: string, codeHash: string) {
  return database.transaction(async (transaction) => {
    const [code] = await transaction.select().from(pairingCodes)
      .where(and(eq(pairingCodes.codeHash, codeHash), gt(pairingCodes.expiresAt, new Date())));
    if (!code) return null;

    const [device] = await transaction.update(devices)
      .set({ ownerUserId, pairedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(devices.id, code.deviceId), isNull(devices.ownerUserId)))
      .returning();
    if (!device) return null;

    await transaction.delete(pairingCodes).where(eq(pairingCodes.id, code.id));
    return device;
  });
}

export async function unpairDevice(database: Database, ownerUserId: string, deviceId: string) {
  return database.transaction(async (transaction) => {
    const [device] = await transaction.update(devices)
      .set({ ownerUserId: null, pairedAt: null, deviceCredentialHash: null, deviceCredentialIssuedAt: null, updatedAt: new Date() })
      .where(and(eq(devices.id, deviceId), eq(devices.ownerUserId, ownerUserId)))
      .returning();
    if (device) await transaction.delete(pairingCodes).where(eq(pairingCodes.deviceId, deviceId));
    return device ?? null;
  });
}

export async function setDeviceCredential(database: Database, deviceId: string, credentialHash: string) {
  await database.update(devices).set({
    deviceCredentialHash: credentialHash,
    deviceCredentialIssuedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(devices.id, deviceId));
}
