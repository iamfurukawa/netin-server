import { and, asc, eq, isNotNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { reactionCatalog } from "../../db/schema.js";

export function listReactions(database: Database, activeOnly = false) {
  return database.select().from(reactionCatalog)
    .where(activeOnly ? and(eq(reactionCatalog.isActive, true), isNotNull(reactionCatalog.assetStorageKey)) : undefined)
    .orderBy(asc(reactionCatalog.displayOrder), asc(reactionCatalog.name));
}

export async function reactionById(database: Database, id: string) {
  const [reaction] = await database.select().from(reactionCatalog).where(eq(reactionCatalog.id, id));
  return reaction ?? null;
}

export async function createReaction(database: Database, input: Omit<typeof reactionCatalog.$inferInsert, "emoji">) {
  const [reaction] = await database.insert(reactionCatalog).values({ ...input, emoji: "?" }).returning();
  return reaction;
}

export async function updateReaction(database: Database, id: string, input: Partial<typeof reactionCatalog.$inferInsert>) {
  const [reaction] = await database.update(reactionCatalog).set({ ...input, updatedAt: new Date() }).where(eq(reactionCatalog.id, id)).returning();
  return reaction ?? null;
}
