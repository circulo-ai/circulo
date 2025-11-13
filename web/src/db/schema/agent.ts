import { user } from "@/db/schema/auth";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";

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

// Predefined agent templates (seeded data)
export const agentTemplate = pgTable(
  "agent_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: text("creator_id").references(() => user.id, {
      onDelete: "set null",
    }), // Can be null for system templates

    name: text("name").notNull(),
    description: text("description"),
    longDescription: text("long_description"),
    systemPrompt: text("system_prompt").notNull(),

    category: text("category"),

    // Model configuration (defaults for instances)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", { precision: 3, scale: 2 })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Visual identity
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),
    tags: jsonb("tags").$type<string[]>().default([]),

    // Tools configuration - references to tool definitions
    toolIds: jsonb("tool_ids").$type<string[]>().default([]),

    // Template status and visibility
    status: agentTemplateStatusEnum("status").notNull().default("draft"),
    visibility: agentVisibilityEnum("visibility").notNull().default("private"),

    // Stats
    instanceCount: integer("instance_count").notNull().default(0),
    usageCount: integer("usage_count").notNull().default(0),

    // SEO & Discovery
    slug: text("slug").unique(),
    featured: boolean("featured").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false), // System-provided templates

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("agent_template_creator_id_idx").on(table.creatorId),
    index("agent_template_status_idx").on(table.status),
    index("agent_template_visibility_idx").on(table.visibility),
    index("agent_template_featured_idx").on(table.featured),
    index("agent_template_slug_idx").on(table.slug),
    index("agent_template_is_system_idx").on(table.isSystem),
    check(
      "agent_template_counts_non_negative",
      sql`instance_count >= 0 AND usage_count >= 0`,
    ),
  ],
);

// User-created agent instances
export const agent = pgTable(
  "agent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Link to template (nullable for custom agents)
    templateId: uuid("template_id").references(() => agentTemplate.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),

    // Model configuration (can override template defaults)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", { precision: 3, scale: 2 })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Avatar and styling
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),

    // Tools configuration - references to tool IDs
    toolIds: jsonb("tool_ids").$type<string[]>().default([]),

    // Usage stats (for this instance)
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agent_user_id_idx").on(table.userId),
    index("agent_template_id_idx").on(table.templateId),
    index("agent_user_template_idx").on(table.userId, table.templateId),
    index("agent_last_used_idx").on(table.lastUsedAt),
    check("agent_usage_count_non_negative", sql`usage_count >= 0`),
  ],
);

// Tool definitions for agents
export const tool = pgTable(
  "tool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // null for system tools

    name: text("name").notNull(),
    description: text("description").notNull(),

    // Tool configuration
    type: text("type").notNull(), // 'function', 'mcp_server', 'api', etc.
    configuration: jsonb("configuration")
      .$type<Record<string, any>>()
      .notNull(),

    // For MCP servers
    mcpServerId: uuid("mcp_server_id").references(() => mcpServer.id, {
      onDelete: "set null",
    }),

    isSystem: boolean("is_system").notNull().default(false), // System-provided tools
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tool_user_id_idx").on(table.userId),
    index("tool_mcp_server_idx").on(table.mcpServerId),
    index("tool_type_idx").on(table.type),
    index("tool_is_system_idx").on(table.isSystem),
  ],
);

// MCP (Model Context Protocol) Server definitions
export const mcpServer = pgTable(
  "mcp_server",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // null for system MCP servers

    name: text("name").notNull(),
    description: text("description"),

    // Server connection details
    endpoint: text("endpoint").notNull(),
    authType: text("auth_type").notNull().default("none"), // 'none', 'api_key', 'oauth', etc.
    authConfig: jsonb("auth_config").$type<Record<string, any>>(),

    // Server metadata
    version: text("version"),
    capabilities: jsonb("capabilities").$type<string[]>().default([]),

    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("mcp_server_user_id_idx").on(table.userId),
    index("mcp_server_is_system_idx").on(table.isSystem),
    index("mcp_server_endpoint_idx").on(table.endpoint),
  ],
);

// Types
export type AgentTemplate = typeof agentTemplate.$inferSelect;
export type NewAgentTemplate = typeof agentTemplate.$inferInsert;
export type AgentVisibility = (typeof agentVisibilityEnum.enumValues)[number];
export type AgentTemplateStatus =
  (typeof agentTemplateStatusEnum.enumValues)[number];

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;

export type McpServer = typeof mcpServer.$inferSelect;
export type NewMcpServer = typeof mcpServer.$inferInsert;

// Generate base Zod schemas from Drizzle tables
// Override numeric fields to work with numbers in API, convert to strings for DB
export const insertAgentSchema = createInsertSchema(agent, {
  temperature: z.number().min(0).max(2).transform(val => val.toString()),
});

export const selectAgentSchema = createSelectSchema(agent, {
  temperature: z.string().transform(val => parseFloat(val)),
});

export const insertAgentTemplateSchema = createInsertSchema(agentTemplate, {
  temperature: z.number().min(0).max(2).transform(val => val.toString()),
});

export const selectAgentTemplateSchema = createSelectSchema(agentTemplate, {
  temperature: z.string().transform(val => parseFloat(val)),
});

// API input schema - accepts numbers, validates, then transforms to strings for DB
export const createAgentSchema = insertAgentSchema
  .omit({
    id: true,           // Exclude auto-generated fields
    createdAt: true,
    updatedAt: true,
    usageCount: true,
    lastUsedAt: true,
    deleted: true,
  })
  .extend({
    // Add custom validations
    name: z.string().min(1).max(100),
    systemPrompt: z.string().min(10).max(5000),
    temperature: z.number().min(0).max(2).default(0.7),
    toolIds: z.array(z.uuid()).optional().default([]),
  })
  .transform((data) => ({
    ...data,
    temperature: data.temperature.toString(), // Convert to string for DB
  }));

export const updateAgentSchema = insertAgentSchema
  .omit({
    id: true,
    userId: true,      // Can't change ownership
    createdAt: true,
    updatedAt: true,
    deleted: true,
  })
  .partial()           // Make all fields optional for updates
  .extend({
    temperature: z.number().min(0).max(2).optional(),
  })
  .transform((data) => ({
    ...data,
    temperature: data.temperature !== undefined
      ? data.temperature.toString()
      : undefined,
  }));
