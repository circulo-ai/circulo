import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/** One row per organization/feature/window. Counters are updated atomically. */
export const quotaBucket = pgTable(
  "quota_buckets",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    limit: integer("limit"),
    reserved: integer("reserved").notNull().default(0),
    consumed: integer("consumed").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.feature, table.periodStart],
    }),
  ],
);

export const quotaReservation = pgTable(
  "quota_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("reserved"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("quota_reservations_idempotency_idx").on(
      table.idempotencyKey,
    ),
  ],
);

export const quotaBucketRelations = relations(quotaBucket, ({ one }) => ({
  organization: one(organization, {
    fields: [quotaBucket.organizationId],
    references: [organization.id],
  }),
}));

export const quotaReservationRelations = relations(
  quotaReservation,
  ({ one }) => ({
    organization: one(organization, {
      fields: [quotaReservation.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [quotaReservation.userId],
      references: [user.id],
    }),
  }),
);

export type QuotaBucket = typeof quotaBucket.$inferSelect;
export type QuotaReservation = typeof quotaReservation.$inferSelect;
