import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { devices, groupMembers, mediaAssets, mediaDeliveries, mediaEvents, socialPreferences, users } from "../../db/schema.js";

export async function createMediaAsset(database: Database, input: typeof mediaAssets.$inferInsert) {
  const [asset] = await database.insert(mediaAssets).values(input).returning();
  return asset;
}

export async function mediaAssetForOwner(database: Database, assetId: string, ownerUserId: string) {
  const [asset] = await database.select().from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerUserId, ownerUserId)));
  return asset ?? null;
}

export async function createMediaEvent(database: Database, input: typeof mediaEvents.$inferInsert) {
  const [event] = await database.insert(mediaEvents).values(input).returning();
  return event;
}

export async function createMediaDeliveriesForGroup(database: Database, eventId: string, groupId: string) {
  const recipients = await database.select({ deviceId: devices.id }).from(groupMembers)
    .innerJoin(devices, eq(devices.ownerUserId, groupMembers.userId))
    .leftJoin(socialPreferences, eq(socialPreferences.userId, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), or(isNull(socialPreferences.interactionsMuted), eq(socialPreferences.interactionsMuted, false))));
  if (recipients.length) await database.insert(mediaDeliveries).values(recipients.map((recipient) => ({ eventId, deviceId: recipient.deviceId }))).onConflictDoNothing();
  return recipients.length;
}

export async function createMediaDeliveriesForUser(database: Database, eventId: string, userId: string) {
  const recipients = await database.select({ deviceId: devices.id }).from(devices)
    .leftJoin(socialPreferences, eq(socialPreferences.userId, devices.ownerUserId))
    .where(and(eq(devices.ownerUserId, userId), or(isNull(socialPreferences.interactionsMuted), eq(socialPreferences.interactionsMuted, false))));
  if (recipients.length) await database.insert(mediaDeliveries).values(recipients.map((recipient) => ({ eventId, deviceId: recipient.deviceId }))).onConflictDoNothing();
  return recipients.length;
}

export async function listPendingMediaDeliveries(database: Database) {
  return database.select({
    eventId: mediaEvents.id, assetId: mediaEvents.assetId, deviceId: mediaDeliveries.deviceId, createdAt: mediaEvents.createdAt, senderName: users.displayName,
    mimeType: mediaAssets.processedMimeType, width: mediaAssets.width, height: mediaAssets.height, sizeBytes: mediaAssets.sizeBytes, sha256: mediaAssets.sha256,
  }).from(mediaDeliveries)
    .innerJoin(mediaEvents, eq(mediaEvents.id, mediaDeliveries.eventId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaEvents.assetId))
    .innerJoin(users, eq(users.id, mediaEvents.senderUserId))
    .where(and(isNull(mediaDeliveries.acknowledgedAt), isNull(mediaDeliveries.failureCode), gt(mediaEvents.expiresAt, new Date())));
}

export async function markMediaDeliveryPublished(database: Database, eventId: string, deviceId: string) {
  await database.update(mediaDeliveries).set({ attempts: sql`${mediaDeliveries.attempts} + 1`, lastAttemptAt: new Date() })
    .where(and(eq(mediaDeliveries.eventId, eventId), eq(mediaDeliveries.deviceId, deviceId), isNull(mediaDeliveries.acknowledgedAt)));
}

export async function acknowledgeMediaDelivery(database: Database, eventId: string, deviceId: string) {
  const [delivery] = await database.update(mediaDeliveries).set({ acknowledgedAt: new Date() })
    .where(and(eq(mediaDeliveries.eventId, eventId), eq(mediaDeliveries.deviceId, deviceId), isNull(mediaDeliveries.acknowledgedAt))).returning();
  return Boolean(delivery);
}

export async function failMediaDelivery(database: Database, eventId: string, deviceId: string, code: string) {
  await database.update(mediaDeliveries).set({ failureCode: code })
    .where(and(eq(mediaDeliveries.eventId, eventId), eq(mediaDeliveries.deviceId, deviceId), isNull(mediaDeliveries.acknowledgedAt)));
}

export async function mediaAssetForDeviceDelivery(database: Database, assetId: string, deviceId: string) {
  const [asset] = await database.select({ asset: mediaAssets }).from(mediaDeliveries)
    .innerJoin(mediaEvents, eq(mediaEvents.id, mediaDeliveries.eventId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaEvents.assetId))
    .where(and(eq(mediaDeliveries.deviceId, deviceId), eq(mediaEvents.assetId, assetId), gt(mediaEvents.expiresAt, new Date())))
    .limit(1);
  return asset?.asset ?? null;
}

export async function cancelPendingMediaDeliveriesForUser(database: Database, userId: string, groupId?: string) {
  const deviceRows = await database.select({ id: devices.id }).from(devices).where(eq(devices.ownerUserId, userId));
  const deviceIds = deviceRows.map((device) => device.id);
  if (!deviceIds.length) return;
  const rows = await database.select({ id: mediaDeliveries.id }).from(mediaDeliveries)
    .innerJoin(mediaEvents, eq(mediaEvents.id, mediaDeliveries.eventId))
    .where(and(inArray(mediaDeliveries.deviceId, deviceIds), isNull(mediaDeliveries.acknowledgedAt), groupId ? eq(mediaEvents.groupId, groupId) : undefined));
  if (rows.length) await database.delete(mediaDeliveries).where(inArray(mediaDeliveries.id, rows.map((row) => row.id)));
}

export async function mediaStorageOverview(database: Database) {
  const [summary] = await database.select({
    count: sql<number>`count(*)`,
    totalBytes: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
  }).from(mediaAssets);
  const assets = await database.select({
    id: mediaAssets.id,
    ownerName: users.displayName,
    mimeType: mediaAssets.processedMimeType,
    sizeBytes: mediaAssets.sizeBytes,
    processingState: mediaAssets.processingState,
    createdAt: mediaAssets.createdAt,
    expiresAt: mediaAssets.expiresAt,
  }).from(mediaAssets).innerJoin(users, eq(users.id, mediaAssets.ownerUserId))
    .orderBy(desc(mediaAssets.createdAt)).limit(100);
  return { count: Number(summary?.count ?? 0), totalBytes: Number(summary?.totalBytes ?? 0), assets };
}

export async function expiredMediaAssets(database: Database) {
  return database.select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, sizeBytes: mediaAssets.sizeBytes })
    .from(mediaAssets).where(lt(mediaAssets.expiresAt, new Date()));
}

export async function deleteMediaAssets(database: Database, assetIds: string[]) {
  if (assetIds.length) await database.delete(mediaAssets).where(inArray(mediaAssets.id, assetIds));
}
