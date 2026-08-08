import { eq } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { socialEvents, socialPreferences } from "../../db/schema.js";

export async function getSocialPreferences(database: Database, userId: string) {
  const [preferences] = await database.select().from(socialPreferences).where(eq(socialPreferences.userId, userId));
  return preferences ?? null;
}

export async function setSocialPreferences(database: Database, userId: string, interactionsMuted: boolean) {
  const [preferences] = await database.insert(socialPreferences).values({ userId, interactionsMuted })
    .onConflictDoUpdate({ target: socialPreferences.userId, set: { interactionsMuted, updatedAt: new Date() } }).returning();
  return preferences;
}

export async function createSocialEvent(database: Database, input: typeof socialEvents.$inferInsert) {
  const [event] = await database.insert(socialEvents).values(input).returning();
  return event;
}
