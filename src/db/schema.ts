import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  color: text("color"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
  check("users_email_normalized", sql`${table.email} = lower(${table.email})`),
  check("users_display_name_length", sql`char_length(${table.displayName}) BETWEEN 1 AND 24`),
  check("users_color_format", sql`${table.color} IS NULL OR ${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("sessions_user_id_index").on(table.userId),
  index("sessions_expires_at_index").on(table.expiresAt),
]);

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  hardwareTarget: text("hardware_target").notNull(),
  bootstrapSecretHash: text("bootstrap_secret_hash").notNull(),
  deviceCredentialHash: text("device_credential_hash"),
  deviceCredentialIssuedAt: timestamp("device_credential_issued_at", { withTimezone: true }),
  pairedAt: timestamp("paired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("devices_owner_user_id_index").on(table.ownerUserId),
]);

export const pairingCodes = pgTable("pairing_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().unique().references(() => devices.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("pairing_codes_expires_at_index").on(table.expiresAt),
]);

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  registrationsOpen: boolean("registrations_open").default(true).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("groups_active_index").on(table.archivedAt),
  check("groups_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 40`),
]);

export const groupMembers = pgTable("group_members", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
  index("group_members_user_id_index").on(table.userId),
]);
