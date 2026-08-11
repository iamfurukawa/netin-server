import type { Database } from "../../db/client.js";
import type { UserRecord } from "../auth/auth.repository.js";
import { archiveGroupRecord, createGroupRecord, findActiveGroup, joinGroupRecord, leaveGroupRecord, listActiveGroups, listGroupMembers, updateGroupRecord } from "./group.repository.js";
import { cancelDeliveriesForGroupMember } from "../social/social.service.js";

export class GroupNotFoundError extends Error {}
export class GroupClosedError extends Error {}
export class GroupForbiddenError extends Error {}

export function requireAdmin(user: UserRecord) {
  if (!user.isAdmin) throw new GroupForbiddenError();
}

export async function listGroups(database: Database, userId: string) {
  return listActiveGroups(database, userId);
}

export async function joinGroup(database: Database, groupId: string, userId: string) {
  const group = await findActiveGroup(database, groupId);
  if (!group) throw new GroupNotFoundError();
  if (!group.registrationsOpen) throw new GroupClosedError();
  await joinGroupRecord(database, group.id, userId);
}

export async function leaveGroup(database: Database, groupId: string, userId: string) {
  const group = await findActiveGroup(database, groupId);
  if (!group) throw new GroupNotFoundError();
  await leaveGroupRecord(database, group.id, userId);
  await cancelDeliveriesForGroupMember(database, group.id, userId);
}

export async function createGroup(database: Database, user: UserRecord, input: { name: string; registrationsOpen?: boolean }) {
  requireAdmin(user);
  return createGroupRecord(database, { name: input.name, createdByUserId: user.id, registrationsOpen: input.registrationsOpen ?? true });
}

export async function updateGroup(database: Database, user: UserRecord, groupId: string, input: { name?: string; registrationsOpen?: boolean }) {
  requireAdmin(user);
  const group = await updateGroupRecord(database, groupId, input);
  if (!group) throw new GroupNotFoundError();
  return group;
}

export async function archiveGroup(database: Database, user: UserRecord, groupId: string) {
  requireAdmin(user);
  const group = await archiveGroupRecord(database, groupId);
  if (!group) throw new GroupNotFoundError();
}

export async function membersOfGroup(database: Database, user: UserRecord, groupId: string) {
  requireAdmin(user);
  if (!await findActiveGroup(database, groupId)) throw new GroupNotFoundError();
  return listGroupMembers(database, groupId);
}

export async function removeMember(database: Database, user: UserRecord, groupId: string, memberUserId: string) {
  requireAdmin(user);
  if (!await findActiveGroup(database, groupId)) throw new GroupNotFoundError();
  await leaveGroupRecord(database, groupId, memberUserId);
  await cancelDeliveriesForGroupMember(database, groupId, memberUserId);
}
