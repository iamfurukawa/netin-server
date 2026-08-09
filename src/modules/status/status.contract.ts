import { z } from "zod";

export const statusValues = ["available", "busy", "focused", "away", "invisible", "in_call", "gaming", "sleeping", "do_not_disturb"] as const;
export const statusSchema = z.enum(statusValues);
export type PresenceStatus = z.infer<typeof statusSchema>;

export const updateStatusSchema = z.object({ status: statusSchema });

export const deviceStatusEventSchema = z.object({
  protocolVersion: z.literal(1),
  eventId: z.string().uuid(),
  type: z.literal("status_changed"),
  status: statusSchema,
  createdAt: z.string().datetime({ offset: true }),
  deviceVersion: z.number().int().nonnegative(),
}).strict();
