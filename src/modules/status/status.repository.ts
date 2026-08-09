import { eq, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { devices, statusEvents, userStatuses } from "../../db/schema.js";
import type { PresenceStatus } from "./status.contract.js";

export async function findStatus(database: Database, userId: string) {
  const [status] = await database.select().from(userStatuses).where(eq(userStatuses.userId, userId));
  return status ?? null;
}

export async function findStatusEvent(database: Database, eventId: string) {
  const [event] = await database.select().from(statusEvents).where(eq(statusEvents.eventId, eventId));
  return event ?? null;
}

export async function findDeviceOwner(database: Database, deviceId: string) {
  const [device] = await database.select({ id: devices.id, ownerUserId: devices.ownerUserId }).from(devices).where(eq(devices.id, deviceId));
  return device ?? null;
}

export async function listPairedDeviceIds(database: Database, userId: string) {
  return database.select({ id: devices.id }).from(devices).where(eq(devices.ownerUserId, userId));
}

export async function applyStatusEvent(database: Database, input: {
  eventId: string; userId: string; deviceId: string | null; status: PresenceStatus; deviceVersion: number | null; createdAt: Date;
}) {
  return database.transaction(async (transaction) => {
    const [claimed] = await transaction.insert(statusEvents).values({ ...input, globalVersion: null })
      .onConflictDoNothing({ target: statusEvents.eventId }).returning();
    if (!claimed) {
      const [existing] = await transaction.select().from(statusEvents).where(eq(statusEvents.eventId, input.eventId));
      const [current] = await transaction.select().from(userStatuses).where(eq(userStatuses.userId, input.userId));
      return { applied: false, event: existing, current };
    }

    const [current] = await transaction.insert(userStatuses).values({
      userId: input.userId,
      status: input.status,
      sourceEventId: input.eventId,
      sourceDeviceId: input.deviceId,
    }).onConflictDoUpdate({
      target: userStatuses.userId,
      set: {
        status: input.status,
        sourceEventId: input.eventId,
        sourceDeviceId: input.deviceId,
        globalVersion: sql`${userStatuses.globalVersion} + 1`,
        updatedAt: new Date(),
      },
    }).returning();
    const [event] = await transaction.update(statusEvents).set({ globalVersion: current.globalVersion })
      .where(eq(statusEvents.eventId, input.eventId)).returning();
    return { applied: true, event, current };
  });
}
