import mqtt, { type MqttClient } from "mqtt";
import type { FastifyBaseLogger } from "fastify";

import type { Database } from "../../db/client.js";
import type { Environment } from "../../config.js";
import { deviceStatusEventSchema } from "./status.contract.js";
import { markDeviceSeen } from "../devices/device.repository.js";
import { pairedDeviceIds, updateStatusFromDevice } from "./status.service.js";

export type StatusPublisher = { publishStatus(userId: string, status: { status: string; globalVersion: number; sourceEventId: string }): Promise<boolean> };

const deviceEventTopic = "netin/v1/devices/+/events";
const protocolVersion = 1;

export function createStatusSynchronizer(environment: Environment, database: Database, logger: FastifyBaseLogger): StatusPublisher & { start(): void; stop(): Promise<void> } {
  let client: MqttClient | null = null;

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
        else logger.info({ topic: deviceEventTopic }, "MQTT status synchronizer connected");
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
  };
}
