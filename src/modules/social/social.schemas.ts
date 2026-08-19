import { z } from "zod";

export const socialPreferencesSchema = z.object({ muted: z.boolean() });

export const sendGroupInteractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reaction"), reactionId: z.string().uuid() }),
  z.object({ type: z.literal("message"), text: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal("poke"), targetUserId: z.string().uuid().optional() }),
]);
