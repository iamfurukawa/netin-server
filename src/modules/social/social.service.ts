import type { Database } from "../../db/client.js";
import { findActiveGroup, isGroupMember } from "../groups/group.repository.js";
import { cancelPendingDeliveriesForUser, createDeliveriesForGroupEvent, createDeliveriesForUserEvent, createSocialEvent, getSocialPreferences, removeCompletedEvent, setSocialPreferences } from "./social.repository.js";
import { cancelPendingMediaDeliveriesForUser } from "../media/media.repository.js";
import { activeReactionById, ReactionInactiveError, ReactionNotFoundError } from "../reactions/reaction.service.js";
import type { z } from "zod";
import type { sendGroupInteractionSchema } from "./social.schemas.js";

export class SocialGroupNotFoundError extends Error {}
export class GroupMembershipRequiredError extends Error {}
export class InvalidPokeTargetError extends Error {}
export { ReactionInactiveError, ReactionNotFoundError };

export type SocialDeliveryPublisher = { publishPendingSocialDeliveries(): Promise<void> };

const eventLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export async function preferencesForUser(database: Database, userId: string) {
  const preferences = await getSocialPreferences(database, userId);
  return { muted: preferences?.interactionsMuted ?? false };
}

export async function updatePreferences(database: Database, userId: string, muted: boolean) {
  const preferences = await setSocialPreferences(database, userId, muted);
  if (muted) {
    const eventIds = await cancelPendingDeliveriesForUser(database, userId);
    await Promise.all(eventIds.map((eventId) => removeCompletedEvent(database, eventId)));
    await cancelPendingMediaDeliveriesForUser(database, userId);
  }
  return { muted: preferences.interactionsMuted };
}

export async function cancelDeliveriesForGroupMember(database: Database, groupId: string, userId: string) {
  const eventIds = await cancelPendingDeliveriesForUser(database, userId, groupId);
  await Promise.all(eventIds.map((eventId) => removeCompletedEvent(database, eventId)));
  await cancelPendingMediaDeliveriesForUser(database, userId, groupId);
}

export async function sendGroupInteraction(database: Database, senderUserId: string, groupId: string, input: z.infer<typeof sendGroupInteractionSchema>, publisher?: SocialDeliveryPublisher) {
  if (!await findActiveGroup(database, groupId)) throw new SocialGroupNotFoundError();
  if (!await isGroupMember(database, groupId, senderUserId)) throw new GroupMembershipRequiredError();
  if (input.type === "poke" && input.targetUserId && (input.targetUserId === senderUserId || !await isGroupMember(database, groupId, input.targetUserId))) {
    throw new InvalidPokeTargetError();
  }
  const payload = input.type === "reaction"
    ? { reactionId: input.reactionId, reaction: (await activeReactionById(database, input.reactionId)).emoji }
    : input.type === "message" ? { text: input.text } : {};
  const event = await createSocialEvent(database, {
    senderUserId,
    groupId,
    targetUserId: input.type === "poke" ? input.targetUserId : undefined,
    type: input.type,
    payload,
    protocolVersion: 1,
    expiresAt: new Date(Date.now() + eventLifetimeMs),
  });
  const recipients = input.type === "poke" && input.targetUserId
    ? await createDeliveriesForUserEvent(database, event.id, input.targetUserId)
    : await createDeliveriesForGroupEvent(database, event.id, groupId);
  await publisher?.publishPendingSocialDeliveries();
  return { eventId: event.id, createdAt: event.createdAt, recipients, delivery: "pending_mqtt" as const };
}
