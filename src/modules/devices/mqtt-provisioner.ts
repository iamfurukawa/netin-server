import { randomUUID } from "node:crypto";

import mqtt, { type IClientOptions, type MqttClient } from "mqtt";

import type { Environment } from "../../config.js";

const controlTopic = "$CONTROL/dynamic-security/v1";
const responseTopic = "$CONTROL/dynamic-security/v1/response";
const deviceRole = "netin-device";

type DynamicSecurityResponse = {
  responses?: Array<{ command?: string; correlationData?: string; error?: string }>;
};

export class MqttProvisioningError extends Error {}

export type MqttProvisioner = {
  readonly enabled: boolean;
  provisionDevice(deviceId: string, password: string): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
};

function mqttConnectionOptions(environment: Environment): IClientOptions {
  return {
    clientId: environment.MQTT_ADMIN_CLIENT_ID ?? environment.MQTT_ADMIN_USERNAME,
    username: environment.MQTT_ADMIN_USERNAME,
    password: environment.MQTT_ADMIN_PASSWORD,
    reconnectPeriod: 0,
    connectTimeout: 8_000,
    clean: true,
  };
}

function hasDynamicSecurityConfiguration(environment: Environment) {
  return Boolean(environment.MQTT_URL && environment.MQTT_ADMIN_USERNAME && environment.MQTT_ADMIN_PASSWORD);
}

function deviceUsername(deviceId: string) {
  return `device-${deviceId}`;
}

async function connect(environment: Environment): Promise<MqttClient> {
  const mqttUrl = environment.MQTT_URL;
  if (!mqttUrl) throw new MqttProvisioningError("MQTT is not configured");

  return new Promise<MqttClient>((resolve, reject) => {
    const client = mqtt.connect(mqttUrl, mqttConnectionOptions(environment));
    const onConnect = () => {
      cleanup();
      resolve(client);
    };
    const onError = (error: Error) => {
      cleanup();
      client.end(true);
      reject(new MqttProvisioningError(`Could not connect to MQTT dynamic security: ${error.message}`));
    };
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };
    client.once("connect", onConnect);
    client.once("error", onError);
  });
}

async function close(client: MqttClient) {
  await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
}

async function command(client: MqttClient, commandName: string, commandPayload: Record<string, unknown>) {
  const correlationData = randomUUID();
  const response = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("message", onMessage);
      reject(new MqttProvisioningError(`Timed out waiting for dynamic security command ${commandName}`));
    }, 8_000);
    const onMessage = (topic: string, payload: Buffer) => {
      if (topic !== responseTopic) return;
      try {
        const body = JSON.parse(payload.toString("utf8")) as DynamicSecurityResponse;
        const result = body.responses?.find((item) => item.command === commandName && item.correlationData === correlationData);
        if (!result) return;
        clearTimeout(timeout);
        client.off("message", onMessage);
        if (result.error) reject(new MqttProvisioningError(`Dynamic security command ${commandName} failed: ${result.error}`));
        else resolve();
      } catch (error) {
        clearTimeout(timeout);
        client.off("message", onMessage);
        reject(new MqttProvisioningError(`Invalid dynamic security response: ${error instanceof Error ? error.message : "unknown error"}`));
      }
    };
    client.on("message", onMessage);
  });

  await new Promise<void>((resolve, reject) => client.subscribe(responseTopic, { qos: 1 }, (error) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => client.publish(controlTopic, JSON.stringify({
    commands: [{ command: commandName, correlationData, ...commandPayload }],
  }), { qos: 1 }, (error) => error ? reject(error) : resolve()));
  await response;
}

export function createMqttProvisioner(environment: Environment): MqttProvisioner {
  const enabled = hasDynamicSecurityConfiguration(environment);

  return {
    enabled,
    async provisionDevice(deviceId, password) {
      if (!enabled) return;
      const client = await connect(environment);
      const username = deviceUsername(deviceId);
      try {
        try {
          await command(client, "createClient", {
            username,
            password,
            clientid: deviceId,
            roles: [{ rolename: deviceRole, priority: 1 }],
          });
        } catch (error) {
          if (!(error instanceof MqttProvisioningError) || !error.message.includes("Client already exists")) throw error;
          await command(client, "modifyClient", {
            username,
            password,
            clientid: deviceId,
            roles: [{ rolename: deviceRole, priority: 1 }],
          });
        }
      } finally {
        await close(client);
      }
    },
    async revokeDevice(deviceId) {
      if (!enabled) return;
      const client = await connect(environment);
      try {
        try {
          await command(client, "deleteClient", { username: deviceUsername(deviceId) });
        } catch (error) {
          if (!(error instanceof MqttProvisioningError) || !error.message.includes("Client not found")) throw error;
        }
      } finally {
        await close(client);
      }
    },
  };
}
