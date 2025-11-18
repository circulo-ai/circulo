import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const auditLog = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id"),
    actorType: text("actor_type"),
    changes: jsonb("changes").$type<Record<string, any> | null>(),
    metadata: jsonb("metadata").$type<Record<string, any> | null>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entityIdx: index("audit_logs_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    actorIdx: index("audit_logs_actor_idx").on(table.actorId),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  }),
);

// Audit Log types
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
