import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { devices, eventDeliveries, groupMembers, socialEvents, socialPreferences, users } from "../../db/schema.js";

export async function getSocialPreferences(database: Database, userId: string) {
  const [preferences] = await database.select().from(socialPreferences).where(eq(socialPreferences.userId, userId));
  return preferences ?? null;
}

export async function setSocialPreferences(database: Database, userId: string, interactionsMuted: boolean) {
  const [preferences] = await database.insert(socialPreferences).values({ userId, interactionsMuted })
    .onConflictDoUpdate({ target: socialPreferences.userId, set: { interactionsMuted, updatedAt: new Date() } }).returning();
  return preferences;
}

export async function createSocialEvent(database: Database, input: typeof socialEvents.$inferInsert) {
  const [event] = await database.insert(socialEvents).values(input).returning();
  return event;
}

export async function createDeliveriesForGroupEvent(database: Database, eventId: string, groupId: string) {
  const recipients = await database.select({ deviceId: devices.id }).from(groupMembers)
    .innerJoin(devices, eq(devices.ownerUserId, groupMembers.userId))
    .leftJoin(socialPreferences, eq(socialPreferences.userId, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), or(isNull(socialPreferences.interactionsMuted), eq(socialPreferences.interactionsMuted, false))));
  if (recipients.length === 0) return 0;
  await database.insert(eventDeliveries).values(recipients.map((recipient) => ({ eventId, deviceId: recipient.deviceId }))).onConflictDoNothing();
  return recipients.length;
}

export async function listPendingDeliveries(database: Database) {
  return database.select({
    eventId: socialEvents.id,
    deviceId: eventDeliveries.deviceId,
    type: socialEvents.type,
    payload: socialEvents.payload,
    createdAt: socialEvents.createdAt,
    senderName: users.displayName,
  }).from(eventDeliveries)
    .innerJoin(socialEvents, eq(socialEvents.id, eventDeliveries.eventId))
    .innerJoin(users, eq(users.id, socialEvents.senderUserId))
    .where(and(isNull(eventDeliveries.acknowledgedAt), gt(socialEvents.expiresAt, new Date())));
}

export async function markDeliveryPublished(database: Database, eventId: string, deviceId: string) {
  await database.update(eventDeliveries).set({ attempts: sql`${eventDeliveries.attempts} + 1`, lastAttemptAt: new Date() })
    .where(and(eq(eventDeliveries.eventId, eventId), eq(eventDeliveries.deviceId, deviceId), isNull(eventDeliveries.acknowledgedAt)));
}

export async function acknowledgeDelivery(database: Database, eventId: string, deviceId: string) {
  const [delivery] = await database.update(eventDeliveries).set({ acknowledgedAt: new Date() })
    .where(and(eq(eventDeliveries.eventId, eventId), eq(eventDeliveries.deviceId, deviceId), isNull(eventDeliveries.acknowledgedAt)))
    .returning({ eventId: eventDeliveries.eventId });
  return Boolean(delivery);
}

export async function removeCompletedEvent(database: Database, eventId: string) {
  const [pending] = await database.select({ id: eventDeliveries.id }).from(eventDeliveries)
    .where(and(eq(eventDeliveries.eventId, eventId), isNull(eventDeliveries.acknowledgedAt))).limit(1);
  if (!pending) await database.delete(socialEvents).where(eq(socialEvents.id, eventId));
}

export async function removeExpiredEvents(database: Database) {
  await database.delete(socialEvents).where(lt(socialEvents.expiresAt, new Date()));
}

async function pendingEventIdsForDevices(database: Database, deviceIds: string[], groupId?: string) {
  if (deviceIds.length === 0) return [];
  const rows = await database.select({ eventId: eventDeliveries.eventId }).from(eventDeliveries)
    .innerJoin(socialEvents, eq(socialEvents.id, eventDeliveries.eventId))
    .where(and(inArray(eventDeliveries.deviceId, deviceIds), isNull(eventDeliveries.acknowledgedAt), groupId ? eq(socialEvents.groupId, groupId) : undefined));
  return [...new Set(rows.map((row) => row.eventId))];
}

export async function cancelPendingDeliveriesForUser(database: Database, userId: string, groupId?: string) {
  const deviceRows = await database.select({ id: devices.id }).from(devices).where(eq(devices.ownerUserId, userId));
  const deviceIds = deviceRows.map((device) => device.id);
  const eventIds = await pendingEventIdsForDevices(database, deviceIds, groupId);
  if (deviceIds.length > 0) {
    await database.delete(eventDeliveries).where(and(inArray(eventDeliveries.deviceId, deviceIds), isNull(eventDeliveries.acknowledgedAt), groupId ? inArray(eventDeliveries.eventId, eventIds) : undefined));
  }
  return eventIds;
}
