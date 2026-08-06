import { and, eq, gt } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { sessions, users } from "../../db/schema.js";

export type UserRecord = typeof users.$inferSelect;

export async function findUserByEmail(database: Database, email: string) {
  const [user] = await database.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function createUser(database: Database, input: {
  email: string; passwordHash: string; displayName: string; color: string | null;
}) {
  const [user] = await database.insert(users).values(input).onConflictDoNothing({ target: users.email }).returning();
  return user ?? null;
}

export async function createSession(database: Database, userId: string, tokenHash: string, expiresAt: Date) {
  await database.insert(sessions).values({ userId, tokenHash, expiresAt });
}

export async function deleteSession(database: Database, tokenHash: string) {
  await database.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function findSessionUser(database: Database, tokenHash: string) {
  const [result] = await database
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
  return result?.user ?? null;
}
