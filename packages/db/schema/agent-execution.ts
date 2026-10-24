import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const agentExecutionSettings = pgTable("agent_execution_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<unknown>().notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentExecutionReservation = pgTable(
  "agent_execution_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    workflowRunId: text("workflow_run_id"),
    agentExecutionId: text("agent_execution_id"),
    model: text("model"),
    feature: text("feature").notNull(),
    reservedTokens: bigint("reserved_tokens", { mode: "number" }).notNull(),
    actualTokens: bigint("actual_tokens", { mode: "number" }),
    status: text("status").notNull().default("reserved"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_execution_reservations_idempotency_idx").on(
      table.idempotencyKey,
    ),
    index("agent_execution_reservations_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("agent_execution_reservations_agent_run_idx").on(
      table.organizationId,
      table.agentExecutionId,
      table.createdAt,
    ),
  ],
);

export const agentExecutionSettingsRelations = relations(
  agentExecutionSettings,
  ({ one }) => ({
    organization: one(organization, {
      fields: [agentExecutionSettings.organizationId],
      references: [organization.id],
    }),
    updatedByUser: one(user, {
      fields: [agentExecutionSettings.updatedBy],
      references: [user.id],
    }),
  }),
);

export const agentExecutionReservationRelations = relations(
  agentExecutionReservation,
  ({ one }) => ({
    organization: one(organization, {
      fields: [agentExecutionReservation.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [agentExecutionReservation.userId],
      references: [user.id],
    }),
  }),
);

export type AgentExecutionSettingsRow =
  typeof agentExecutionSettings.$inferSelect;
export type AgentExecutionReservation =
  typeof agentExecutionReservation.$inferSelect;
