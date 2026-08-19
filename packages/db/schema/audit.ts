import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    authMethod: text("auth_method"),
    organizationId: text("organization_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome").notNull(),
    statusCode: integer("status_code"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("audit_event_occurred_at_idx").on(table.occurredAt),
    index("audit_event_actor_idx").on(table.actorType, table.actorId),
    index("audit_event_org_idx").on(table.organizationId, table.occurredAt),
  ],
);

export const auditOutbox = pgTable(
  "audit_outbox",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => auditEvent.id, { onDelete: "cascade" })
      .unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dispatchedAt: timestamp("dispatched_at"),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (table) => [index("audit_outbox_pending_idx").on(table.dispatchedAt, table.createdAt)],
);

export const auditEventRelations = relations(auditEvent, ({ one }) => ({
  outbox: one(auditOutbox, {
    fields: [auditEvent.id],
    references: [auditOutbox.eventId],
  }),
}));

export type AuditEvent = typeof auditEvent.$inferSelect;
export type NewAuditEvent = typeof auditEvent.$inferInsert;

