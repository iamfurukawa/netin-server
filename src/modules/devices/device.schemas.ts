import { z } from "zod";

export const registerDeviceSchema = z.object({
  deviceId: z.string().uuid(),
  bootstrapSecret: z.string().min(32).max(128),
  hardwareTarget: z.string().trim().min(1).max(64),
});

export const issuePairingCodeSchema = z.object({
  deviceId: z.string().uuid(),
  bootstrapSecret: z.string().min(32).max(128),
});

export const deviceBootstrapSchema = issuePairingCodeSchema;

export const pairDeviceSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
});
