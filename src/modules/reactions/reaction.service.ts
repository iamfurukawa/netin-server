import type { Database } from "../../db/client.js";
import { createReaction, listReactions, reactionById, updateReaction } from "./reaction.repository.js";

export class ReactionNotFoundError extends Error {}
export class ReactionInactiveError extends Error {}

export function activeReactions(database: Database) {
  return listReactions(database, true);
}

export function allReactions(database: Database) {
  return listReactions(database);
}

export async function activeReactionById(database: Database, id: string) {
  const reaction = await reactionById(database, id);
  if (!reaction) throw new ReactionNotFoundError();
  if (!reaction.isActive || !reaction.assetStorageKey || !reaction.assetMimeType || !reaction.assetSizeBytes || !reaction.assetSha256) throw new ReactionInactiveError();
  return reaction;
}

export function addReaction(database: Database, input: { name: string; displayOrder: number; isActive: boolean; assetMimeType: "image/jpeg" | "image/gif"; assetSizeBytes: number; assetSha256: string; assetStorageKey: string }) {
  return createReaction(database, input);
}

export async function editReaction(database: Database, id: string, input: Partial<{ name: string; displayOrder: number; isActive: boolean; assetMimeType: "image/jpeg" | "image/gif"; assetSizeBytes: number; assetSha256: string; assetStorageKey: string }>) {
  const reaction = await updateReaction(database, id, input);
  if (!reaction) throw new ReactionNotFoundError();
  return reaction;
}
