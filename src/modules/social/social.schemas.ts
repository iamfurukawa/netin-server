import { z } from "zod";

export const socialPreferencesSchema = z.object({ muted: z.boolean() });

export const sendGroupInteractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reaction"), reaction: z.enum(["👍", "❤️", "😂", "🎉", "👋", "👏", "🔥", "✨"]) }),
  z.object({ type: z.literal("message"), text: z.string().trim().min(1).max(160) }),
]);
