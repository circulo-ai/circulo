import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agent } from "./agent";
import { organization, user } from "./auth";
import { mcpIntegration } from "./automation";
import { chat } from "./chat";

export const skillSourceTypeEnum = pgEnum("skill_source_type", [
  "manual",
  "mcp",
]);

export const skillAssignmentScopeEnum = pgEnum("skill_assignment_scope", [
  "organization",
  "chat",
  "agent",
]);

/**
 * A skill is executable prompt/instruction context, not a pretend tool.
 * It only affects orchestration after it is explicitly assigned to a scope.
 */
export const skill = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    sourceType: skillSourceTypeEnum("source_type").notNull().default("manual"),
    mcpIntegrationId: uuid("mcp_integration_id").references(
      () => mcpIntegration.id,
      { onDelete: "set null" },
    ),
    version: text("version").notNull().default("1.0.0"),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("skills_org_name_idx").on(t.organizationId, t.name),
    index("skills_org_enabled_idx").on(t.organizationId, t.enabled),
    index("skills_mcp_idx").on(t.mcpIntegrationId),
  ],
);

export const skillAssignment = pgTable(
  "skill_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
    scope: skillAssignmentScopeEnum("scope").notNull(),
    chatId: uuid("chat_id").references(() => chat.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agent.id, {
      onDelete: "cascade",
    }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_assignments_unique_org_idx")
      .on(t.skillId)
      .where(
        sql`scope = 'organization' AND chat_id IS NULL AND agent_id IS NULL`,
      ),
    uniqueIndex("skill_assignments_unique_chat_idx")
      .on(t.skillId, t.chatId)
      .where(sql`scope = 'chat' AND chat_id IS NOT NULL AND agent_id IS NULL`),
    uniqueIndex("skill_assignments_unique_agent_idx")
      .on(t.skillId, t.agentId)
      .where(sql`scope = 'agent' AND chat_id IS NULL AND agent_id IS NOT NULL`),
    index("skill_assignments_chat_idx").on(t.chatId, t.enabled),
    index("skill_assignments_agent_idx").on(t.agentId, t.enabled),
    check(
      "skill_assignments_target_check",
      sql`(
				(scope = 'organization' AND chat_id IS NULL AND agent_id IS NULL)
				OR (scope = 'chat' AND chat_id IS NOT NULL AND agent_id IS NULL)
				OR (scope = 'agent' AND chat_id IS NULL AND agent_id IS NOT NULL)
			)`,
    ),
  ],
);

export const skillRelations = relations(skill, ({ one, many }) => ({
  organization: one(organization, {
    fields: [skill.organizationId],
    references: [organization.id],
  }),
  creator: one(user, {
    fields: [skill.createdBy],
    references: [user.id],
  }),
  mcpIntegration: one(mcpIntegration, {
    fields: [skill.mcpIntegrationId],
    references: [mcpIntegration.id],
  }),
  assignments: many(skillAssignment),
}));

export const skillAssignmentRelations = relations(
  skillAssignment,
  ({ one }) => ({
    skill: one(skill, {
      fields: [skillAssignment.skillId],
      references: [skill.id],
    }),
    chat: one(chat, {
      fields: [skillAssignment.chatId],
      references: [chat.id],
    }),
    agent: one(agent, {
      fields: [skillAssignment.agentId],
      references: [agent.id],
    }),
  }),
);

export type Skill = typeof skill.$inferSelect;
export type SkillAssignment = typeof skillAssignment.$inferSelect;
