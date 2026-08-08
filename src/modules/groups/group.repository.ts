import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { groupMembers, groups, users } from "../../db/schema.js";

export async function listActiveGroups(database: Database, userId: string) {
  const rows = await database.select({
    id: groups.id,
    name: groups.name,
    registrationsOpen: groups.registrationsOpen,
    createdAt: groups.createdAt,
    memberUserId: groupMembers.userId,
  }).from(groups)
    .leftJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)))
    .where(isNull(groups.archivedAt))
    .orderBy(groups.name);
  return rows.map(({ memberUserId, ...group }) => ({ ...group, joined: Boolean(memberUserId) }));
}

export async function findActiveGroup(database: Database, groupId: string) {
  const [group] = await database.select().from(groups)
    .where(and(eq(groups.id, groupId), isNull(groups.archivedAt)));
  return group ?? null;
}

export async function createGroupRecord(database: Database, input: { name: string; createdByUserId: string; registrationsOpen: boolean }) {
  const [group] = await database.insert(groups).values(input).returning();
  return group;
}

export async function updateGroupRecord(database: Database, groupId: string, input: { name?: string; registrationsOpen?: boolean }) {
  const [group] = await database.update(groups).set({ ...input, updatedAt: new Date() })
    .where(and(eq(groups.id, groupId), isNull(groups.archivedAt))).returning();
  return group ?? null;
}

export async function archiveGroupRecord(database: Database, groupId: string) {
  const [group] = await database.update(groups).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(groups.id, groupId), isNull(groups.archivedAt))).returning();
  return group ?? null;
}

export async function joinGroupRecord(database: Database, groupId: string, userId: string) {
  await database.insert(groupMembers).values({ groupId, userId }).onConflictDoNothing();
}

export async function leaveGroupRecord(database: Database, groupId: string, userId: string) {
  const deleted = await database.delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).returning();
  return deleted.length > 0;
}

export async function isGroupMember(database: Database, groupId: string, userId: string) {
  const [member] = await database.select({ userId: groupMembers.userId }).from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return Boolean(member);
}

export async function listGroupMembers(database: Database, groupId: string) {
  return database.select({ id: users.id, displayName: users.displayName, email: users.email, joinedAt: groupMembers.createdAt })
    .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId)).orderBy(users.displayName);
}
