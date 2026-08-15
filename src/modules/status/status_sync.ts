import mqtt, { type MqttClient } from "mqtt";
import type { FastifyBaseLogger } from "fastify";

import type { Database } from "../../db/client.js";
import type { Environment } from "../../config.js";
import { deviceStatusEventSchema } from "./status.contract.js";
import { markDeviceSeen } from "../devices/device.repository.js";
import { pairedDeviceIds, updateStatusFromDevice } from "./status.service.js";
import { acknowledgeDelivery, listPendingDeliveries, markDeliveryPublished, removeCompletedEvent, removeExpiredEvents } from "../social/social.repository.js";
import type { SocialDeliveryPublisher } from "../social/social.service.js";
import { acknowledgeMediaDelivery, failMediaDelivery, listPendingMediaDeliveries, markMediaDeliveryPublished } from "../media/media.repository.js";
import type { MediaDeliveryPublisher } from "../media/media.routes.js";

export type StatusPublisher = { publishStatus(userId: string, status: { status: string; globalVersion: number; sourceEventId: string }): Promise<boolean> };

const deviceEventTopic = "netin/v1/devices/+/events";
const protocolVersion = 1;

export function createStatusSynchronizer(environment: Environment, database: Database, logger: FastifyBaseLogger): StatusPublisher & SocialDeliveryPublisher & MediaDeliveryPublisher & { start(): void; stop(): Promise<void> } {
  let client: MqttClient | null = null;

  async function publishPendingSocialDeliveries() {
    if (!client?.connected) return;
    await removeExpiredEvents(database);
    const deliveries = await listPendingDeliveries(database);
    await Promise.all(deliveries.map(async (delivery) => {
      await new Promise<void>((resolve, reject) => client!.publish(`netin/v1/devices/${delivery.deviceId}/commands`, JSON.stringify({
        protocolVersion,
        type: "social_event",
        eventId: delivery.eventId,
        sender: { name: delivery.senderName },
        interactionType: delivery.type,
        payload: delivery.payload,
        createdAt: delivery.createdAt.toISOString(),
      }), { qos: 1 }, (error) => error ? reject(error) : resolve()));
      await markDeliveryPublished(database, delivery.eventId, delivery.deviceId);
    }));
  }

  async function publishPendingMediaDeliveries() {
    if (!client?.connected) return;
    const deliveries = await listPendingMediaDeliveries(database);
    await Promise.all(deliveries.map(async (delivery) => {
      await new Promise<void>((resolve, reject) => client!.publish(`netin/v1/devices/${delivery.deviceId}/commands`, JSON.stringify({
        protocolVersion,
        type: "media_event",
        eventId: delivery.eventId,
        sender: { name: delivery.senderName },
        media: {
          kind: delivery.mimeType,
          width: delivery.width,
          height: delivery.height,
          size: delivery.sizeBytes,
          sha256: delivery.sha256,
          downloadUrl: new URL(`/device/media/${delivery.assetId}/download`, environment.PUBLIC_API_URL).toString(),
        },
        createdAt: delivery.createdAt.toISOString(),
      }), { qos: 1 }, (error) => error ? reject(error) : resolve()));
      await markMediaDeliveryPublished(database, delivery.eventId, delivery.deviceId);
    }));
  }

  async function publishStatus(userId: string, status: { status: string; globalVersion: number; sourceEventId: string }) {
    if (!client?.connected) return false;
    const deviceIds = await pairedDeviceIds(database, userId);
    await Promise.all(deviceIds.map((deviceId) => new Promise<void>((resolve, reject) => {
      client!.publish(`netin/v1/devices/${deviceId}/commands`, JSON.stringify({
        protocolVersion, type: "status_sync", eventId: status.sourceEventId, status: status.status, globalVersion: status.globalVersion,
      }), { qos: 1, retain: true }, (error) => error ? reject(error) : resolve());
    })));
    return true;
  }

  async function handleDeviceEvent(topic: string, payload: Buffer) {
    const deviceId = topic.split("/")[3];
    if (!deviceId) return;
    try {
      const rawEvent = JSON.parse(payload.toString("utf8")) as { protocolVersion?: number; type?: string };
      if (rawEvent.protocolVersion === protocolVersion && rawEvent.type === "heartbeat") {
        await markDeviceSeen(database, deviceId);
        await publishPendingSocialDeliveries();
        await publishPendingMediaDeliveries();
        return;
      }
      if (rawEvent.protocolVersion === protocolVersion && rawEvent.type === "social_ack" && typeof (rawEvent as { eventId?: unknown }).eventId === "string") {
        if (await acknowledgeDelivery(database, (rawEvent as { eventId: string }).eventId, deviceId)) {
          await removeCompletedEvent(database, (rawEvent as { eventId: string }).eventId);
        }
        return;
      }
      if (rawEvent.protocolVersion === protocolVersion && (rawEvent.type === "media_ack" || rawEvent.type === "media_failed") && typeof (rawEvent as { eventId?: unknown }).eventId === "string") {
        if (rawEvent.type === "media_ack") await acknowledgeMediaDelivery(database, (rawEvent as { eventId: string }).eventId, deviceId);
        else {
          const code = typeof (rawEvent as { code?: unknown }).code === "string" ? (rawEvent as { code: string }).code.slice(0, 64) : "unknown";
          await failMediaDelivery(database, (rawEvent as { eventId: string }).eventId, deviceId, code);
        }
        return;
      }
      const event = deviceStatusEventSchema.parse(rawEvent);
      await markDeviceSeen(database, deviceId);
      const result = await updateStatusFromDevice(database, deviceId, { ...event, createdAt: new Date(event.createdAt) });
      if (!result.current) return;
      await new Promise<void>((resolve, reject) => client!.publish(`netin/v1/devices/${deviceId}/ack`, JSON.stringify({
        protocolVersion, eventId: event.eventId, type: "status_ack", applied: result.applied, status: result.current.status, globalVersion: result.current.globalVersion,
      }), { qos: 1 }, (error) => error ? reject(error) : resolve()));
      await publishStatus(result.current.userId, result.current);
    } catch (error) {
      logger.warn({ err: error, topic }, "Rejected MQTT device event");
    }
  }

  return {
    start() {
      if (!environment.MQTT_URL || client) return;
      client = mqtt.connect(environment.MQTT_URL, {
        clientId: environment.MQTT_CLIENT_ID ?? "netin-server",
        username: environment.MQTT_USERNAME,
        password: environment.MQTT_PASSWORD,
        reconnectPeriod: 3_000,
      });
      client.on("connect", () => client?.subscribe(deviceEventTopic, { qos: 1 }, (error) => {
        if (error) logger.error({ err: error }, "Could not subscribe to device events");
        else {
          logger.info({ topic: deviceEventTopic }, "MQTT status synchronizer connected");
          void publishPendingSocialDeliveries().catch((publishError) => logger.warn({ err: publishError }, "Could not replay social deliveries"));
          void publishPendingMediaDeliveries().catch((publishError) => logger.warn({ err: publishError }, "Could not replay media deliveries"));
        }
      }));
      client.on("message", (topic, payload) => { void handleDeviceEvent(topic, payload); });
      client.on("error", (error) => logger.warn({ err: error }, "MQTT status synchronizer error"));
    },
    async stop() {
      if (!client) return;
      await new Promise<void>((resolve) => client!.end(false, {}, (error) => {
        if (error) logger.warn({ err: error }, "Could not close MQTT status synchronizer cleanly");
        resolve();
      }));
      client = null;
    },
    publishStatus,
    publishPendingSocialDeliveries,
    publishPendingMediaDeliveries,
  };
}
