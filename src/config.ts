import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  MQTT_URL: z.string().url().optional(),
  MQTT_USERNAME: z.string().min(1).optional(),
  MQTT_PASSWORD: z.string().min(1).optional(),
  MQTT_CLIENT_ID: z.string().min(1).optional(),
  MQTT_ADMIN_USERNAME: z.string().min(1).optional(),
  MQTT_ADMIN_PASSWORD: z.string().min(1).optional(),
  MQTT_ADMIN_CLIENT_ID: z.string().min(1).optional(),
  MEDIA_STORAGE_PATH: z.string().min(1).default("data/media"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
