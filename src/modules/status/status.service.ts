import { randomUUID } from "node:crypto";

import type { Database } from "../../db/client.js";
import type { PresenceStatus } from "./status.contract.js";
import { applyStatusEvent, findDeviceOwner, findStatus, listPairedDeviceIds } from "./status.repository.js";

export class StatusDeviceNotFoundError extends Error {}
export class StatusDeviceNotPairedError extends Error {}

export async function currentStatus(database: Database, userId: string) {
  return findStatus(database, userId);
}

export async function updateStatusFromPwa(database: Database, userId: string, status: PresenceStatus) {
  return applyStatusEvent(database, {
    eventId: randomUUID(), userId, deviceId: null, status, deviceVersion: null, createdAt: new Date(),
  });
}

export async function updateStatusFromDevice(database: Database, deviceId: string, input: { eventId: string; status: PresenceStatus; deviceVersion: number; createdAt: Date }) {
  const device = await findDeviceOwner(database, deviceId);
  if (!device) throw new StatusDeviceNotFoundError();
  if (!device.ownerUserId) throw new StatusDeviceNotPairedError();
  return applyStatusEvent(database, {
    eventId: input.eventId, userId: device.ownerUserId, deviceId, status: input.status, deviceVersion: input.deviceVersion, createdAt: input.createdAt,
  });
}

export async function pairedDeviceIds(database: Database, userId: string) {
  return (await listPairedDeviceIds(database, userId)).map((device) => device.id);
}
