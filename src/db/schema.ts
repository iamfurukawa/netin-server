import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("devices_owner_user_id_index").on(table.ownerUserId),
  index("devices_last_seen_at_index").on(table.lastSeenAt),
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

export const socialPreferences = pgTable("social_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  interactionsMuted: boolean("interactions_muted").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reactionCatalog = pgTable("reaction_catalog", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  assetMimeType: text("asset_mime_type"),
  assetSizeBytes: integer("asset_size_bytes"),
  assetSha256: text("asset_sha256"),
  assetStorageKey: text("asset_storage_key"),
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("reaction_catalog_name_unique").on(table.name),
  index("reaction_catalog_active_order_index").on(table.isActive, table.displayOrder),
  check("reaction_catalog_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 32`),
  check("reaction_catalog_asset_complete", sql`(${table.assetMimeType} IS NULL AND ${table.assetSizeBytes} IS NULL AND ${table.assetSha256} IS NULL AND ${table.assetStorageKey} IS NULL) OR (${table.assetMimeType} IN ('image/jpeg', 'image/gif') AND ${table.assetSizeBytes} > 0 AND char_length(${table.assetSha256}) = 64 AND ${table.assetStorageKey} IS NOT NULL)`),
]);

export const socialEvents = pgTable("social_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  protocolVersion: integer("protocol_version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("social_events_group_created_at_index").on(table.groupId, table.createdAt),
  index("social_events_target_user_id_index").on(table.targetUserId),
  index("social_events_expires_at_index").on(table.expiresAt),
  check("social_events_type", sql`${table.type} IN ('reaction', 'message', 'poke')`),
]);

export const eventDeliveries = pgTable("event_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => socialEvents.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_deliveries_event_device_unique").on(table.eventId, table.deviceId),
  index("event_deliveries_device_pending_index").on(table.deviceId, table.acknowledgedAt),
  index("event_deliveries_event_index").on(table.eventId),
]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalMimeType: text("original_mime_type").notNull(),
  processedMimeType: text("processed_mime_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  processingState: text("processing_state").default("ready").notNull(),
  processingError: text("processing_error"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("media_assets_storage_key_unique").on(table.storageKey),
  index("media_assets_owner_created_at_index").on(table.ownerUserId, table.createdAt),
  index("media_assets_expires_at_index").on(table.expiresAt),
  check("media_assets_processing_state", sql`${table.processingState} IN ('processing', 'ready', 'failed')`),
  check("media_assets_dimensions", sql`${table.width} BETWEEN 1 AND 240 AND ${table.height} BETWEEN 1 AND 320`),
  check("media_assets_size_positive", sql`${table.sizeBytes} > 0`),
]);

export const mediaEvents = pgTable("media_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  protocolVersion: integer("protocol_version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("media_events_group_created_at_index").on(table.groupId, table.createdAt),
  index("media_events_asset_id_index").on(table.assetId),
  index("media_events_expires_at_index").on(table.expiresAt),
]);

export const mediaDeliveries = pgTable("media_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => mediaEvents.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("media_deliveries_event_device_unique").on(table.eventId, table.deviceId),
  index("media_deliveries_device_pending_index").on(table.deviceId, table.acknowledgedAt),
  index("media_deliveries_event_index").on(table.eventId),
]);

export const userStatuses = pgTable("user_statuses", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  globalVersion: integer("global_version").default(1).notNull(),
  sourceEventId: uuid("source_event_id").notNull(),
  sourceDeviceId: uuid("source_device_id").references(() => devices.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("user_statuses_value", sql`${table.status} IN ('available', 'busy', 'focused', 'away', 'invisible', 'in_call', 'gaming', 'sleeping', 'do_not_disturb')`),
  check("user_statuses_global_version", sql`${table.globalVersion} >= 1`),
]);

export const statusEvents = pgTable("status_events", {
  eventId: uuid("event_id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  deviceVersion: integer("device_version"),
  globalVersion: integer("global_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("status_events_user_accepted_at_index").on(table.userId, table.acceptedAt),
  index("status_events_device_id_index").on(table.deviceId),
  check("status_events_value", sql`${table.status} IN ('available', 'busy', 'focused', 'away', 'invisible', 'in_call', 'gaming', 'sleeping', 'do_not_disturb')`),
  check("status_events_device_version", sql`${table.deviceVersion} IS NULL OR ${table.deviceVersion} >= 0`),
  check("status_events_global_version", sql`${table.globalVersion} IS NULL OR ${table.globalVersion} >= 1`),
]);
