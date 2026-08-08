import type { Database } from "../../db/client.js";
import { findActiveGroup, isGroupMember } from "../groups/group.repository.js";
import { createSocialEvent, getSocialPreferences, setSocialPreferences } from "./social.repository.js";
import type { z } from "zod";
import type { sendGroupInteractionSchema } from "./social.schemas.js";

export class SocialGroupNotFoundError extends Error {}
export class GroupMembershipRequiredError extends Error {}

const eventLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export async function preferencesForUser(database: Database, userId: string) {
  const preferences = await getSocialPreferences(database, userId);
  return { muted: preferences?.interactionsMuted ?? false };
}

export async function updatePreferences(database: Database, userId: string, muted: boolean) {
  const preferences = await setSocialPreferences(database, userId, muted);
  return { muted: preferences.interactionsMuted };
}

export async function sendGroupInteraction(database: Database, senderUserId: string, groupId: string, input: z.infer<typeof sendGroupInteractionSchema>) {
  if (!await findActiveGroup(database, groupId)) throw new SocialGroupNotFoundError();
  if (!await isGroupMember(database, groupId, senderUserId)) throw new GroupMembershipRequiredError();
  const payload = input.type === "reaction" ? { reaction: input.reaction } : { text: input.text };
  const event = await createSocialEvent(database, {
    senderUserId,
    groupId,
    type: input.type,
    payload,
    protocolVersion: 1,
    expiresAt: new Date(Date.now() + eventLifetimeMs),
  });
  return { eventId: event.id, createdAt: event.createdAt, delivery: "pending_mqtt" as const };
}
