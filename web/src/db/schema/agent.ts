
import { user } from "@/db/schema/auth";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const agentVisibilityEnum = pgEnum("agent_visibility", [
  "private",
  "public",
  "marketplace",
]);

export const agentTemplateStatusEnum = pgEnum("agent_template_status", [
  "draft",
  "published",
  "archived",
]);

// Agent Templates (User-created agent configurations)
export const agent = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: varchar("model", { length: 100 })
    .notNull()
    .default("gemini-2.5-flash"),
  maxTokens: integer("max_output_tokens").default(1000),
  temperature: integer("temperature").default(70), // 0-100
  avatarUrl: text("avatar_url"),

  // Default capabilities
  defaultTools: jsonb("default_tools").$type<string[]>().default([]),
  defaultMcpServers: jsonb("default_mcp_servers").$type<string[]>().default([]),
  defaultKnowledgeBases: jsonb("default_knowledge_bases")
    .$type<string[]>()
    .default([]),

  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types
export type AgentVisibility = (typeof agentVisibilityEnum.enumValues)[number];
export type AgentTemplateStatus =
  (typeof agentTemplateStatusEnum.enumValues)[number];

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

