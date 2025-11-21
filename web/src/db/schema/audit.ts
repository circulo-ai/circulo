import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",
  "system",
  "api,
]);

// ==================== AUDIT LOGS ====================
export const auditLog = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // What was affected
    entityType: text("entity_type").notNull(), // 'chat', 'agent', 'user', etc.
    entityId: text("entity_id").notNull(),

    // What happened
    action: text("action").notNull(), // 'create', 'update', 'delete', 'access', etc.

    // Who did it
    actorId: text("actor_id"),
    actorType: auditActorTypeEnum("actor_type"),

    // Details
    changes: jsonb("changes").$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    }>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    // Request context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    actorIdx: index("audit_logs_actor_idx").on(t.actorId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    actionIdx: index("audit_logs_action_idx").on(t.action)
  }),
);

// ==================== TYPES ====================
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type AuditActorType = (typeof auditActorTypeEnum.enumValues)[number];
