import { SupportedModels } from "@/lib/ai/providers";
import { relations } from "drizzle-orm";
import {
  boolean,
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
import { chatAgent } from "./chat";

export const agent = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership: Organization is primary owner, createdBy tracks creator
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

    // Basic info
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    avatarUrl: text("avatar_url"),

    // Model configuration
    model: text("model")
      .notNull()
      .$type<SupportedModels>()
      .default("gemini-2.5-flash"),
    maxTokens: integer("max_tokens").default(1000),
    temperature: integer("temperature").default(70), // 0-100 scale

    // status
    isArchived: boolean("is_archived").notNull().default(false),

    // Default attachments (IDs of tools, knowledge bases, etc.)
    defaultToolIds: jsonb("default_tool_ids").$type<string[]>().default([]),
    defaultKnowledgeBaseIds: jsonb("default_knowledge_base_ids")
      .$type<string[]>()
      .default([]),

    // Extensible metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("agents_org_idx").on(t.organizationId),
    index("agents_creator_idx").on(t.createdBy),
    uniqueIndex("agents_org_name_idx").on(t.organizationId, t.name),
  ],
);

export const agentRelations = relations(agent, ({ one, many }) => ({
  organization: one(organization, {
    fields: [agent.organizationId],
    references: [organization.id],
  }),
  creator: one(user, {
    fields: [agent.createdBy],
    references: [user.id],
  }),
  chatAgents: many(chatAgent),
}));

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;
