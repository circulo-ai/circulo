import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workflowRun } from "./chat";

/** Immutable, idempotent record of a billable or observable operation. */
export const usageEvent = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    workflowRunId: text("workflow_run_id").references(() => workflowRun.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    model: text("model"),
    feature: text("feature").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    durationMs: integer("duration_ms"),
    providerCost: decimal("provider_cost", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    platformCost: decimal("platform_cost", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    billableAmount: decimal("billable_amount", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_events_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("usage_events_request_idx").on(table.requestId),
    index("usage_events_workflow_idx").on(table.workflowRunId),
  ],
);

export const usageEventRelations = relations(usageEvent, ({ one }) => ({
  organization: one(organization, {
    fields: [usageEvent.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [usageEvent.userId],
    references: [user.id],
  }),
  workflowRun: one(workflowRun, {
    fields: [usageEvent.workflowRunId],
    references: [workflowRun.id],
  }),
}));

export type UsageEvent = typeof usageEvent.$inferSelect;
export type NewUsageEvent = typeof usageEvent.$inferInsert;
