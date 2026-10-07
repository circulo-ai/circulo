import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const syncChange = pgTable(
  "sync_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deviceId: text("device_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
  },
  (table) => [
    index("sync_changes_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("sync_changes_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const syncChangeRelations = relations(syncChange, ({ one }) => ({
  organization: one(organization, {
    fields: [syncChange.organizationId],
    references: [organization.id],
  }),
  actor: one(user, {
    fields: [syncChange.actorUserId],
    references: [user.id],
  }),
}));

export const syncPairingSession = pgTable(
  "sync_pairing_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sync_pairing_sessions_org_idx").on(table.organizationId),
    index("sync_pairing_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const syncDeviceToken = pgTable(
  "sync_device_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jti: text("jti").notNull().unique(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sync_device_tokens_org_idx").on(table.organizationId),
    index("sync_device_tokens_device_idx").on(table.deviceId),
  ],
);

export const syncConflict = pgTable(
  "sync_conflicts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    incomingDeviceId: text("incoming_device_id").notNull(),
    incomingIdempotencyKey: text("incoming_idempotency_key").notNull(),
    incomingPayload: jsonb("incoming_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    winningPayload: jsonb("winning_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    resolution: text("resolution").notNull().default("latest-write-wins"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sync_conflicts_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    uniqueIndex("sync_conflicts_incoming_idx").on(
      table.organizationId,
      table.incomingIdempotencyKey,
    ),
  ],
);

export type SyncChange = typeof syncChange.$inferSelect;
export type NewSyncChange = typeof syncChange.$inferInsert;
