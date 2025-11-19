import { chat } from "@/db";
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
    .default("claude-sonnet-4-20250514"),
  temperature: integer("temperature").default(70), // 0-100
  avatarUrl: text("avatar_url"),
  isPublic: boolean("is_public").default(false), // Can others use this agent?

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
    mcpServerId: text("mcp_server_id"),

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
    foreignKey({
      columns: [table.mcpServerId],
      foreignColumns: [mcpServer.id],
      name: "tool_mcp_server_id_mcp_servers_id_fk",
    }).onDelete("set null"),
  ],
);

// MCP (Model Context Protocol) Server definitions
export const mcpServer = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    // Track who created the server, but chat owns it
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),

    transport: text("transport").notNull(),
    url: text("url"),

    headers: json("headers").default("{}"),
    timeout: integer("timeout").default(30000),
    retries: integer("retries").default(3),

    enabled: boolean("enabled").notNull().default(true),
    lastConnected: timestamp("last_connected"),
    connectionStatus: text("connection_status").default("disconnected"),
    lastError: text("last_error"),

    toolCount: integer("tool_count").default(0),
    lastToolsRefresh: timestamp("last_tools_refresh"),
    totalRequests: integer("total_requests").default(0),
    lastUsed: timestamp("last_used"),

    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Primary access pattern - active servers by chat
    chatEnabledIdx: index("mcp_servers_chat_enabled_idx").on(
      table.chatId,
      table.enabled,
    ),

    // Soft delete pattern - chat + not deleted
    chatDeletedIdx: index("mcp_servers_chat_deleted_idx").on(
      table.chatId,
      table.deletedAt,
    ),
  }),
);

export const insertToolSchema = createInsertSchema(tool);
export const selectToolSchema = createSelectSchema(tool);

export const createToolSchema = insertToolSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    type: z.enum(["builtin", "mcp", "custom", "api"]),
    configuration: z.record(z.string(), z.any()),
    mcpServerId: z.string().optional(),
    isSystem: z.boolean().default(false),
    isActive: z.boolean().default(true),
  });

export const updateToolSchema = insertToolSchema
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial()
  .extend({
    name: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(500).optional(),
    type: z.enum(["builtin", "mcp", "custom", "api"]).optional(),
    configuration: z.record(z.string(), z.any()).optional(),
    isActive: z.boolean().optional(),
  });

export const insertMcpServerSchema = createInsertSchema(mcpServer);
export const selectMcpServerSchema = createSelectSchema(mcpServer);

export const createMcpServerSchema = z.object({
  id: z.string().optional(),
  chatId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  transport: z.literal("streamable-http"),
  url: z.string().url("Must be a valid URL"),
  headers: z.record(z.string(), z.string()).default({}),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
  enabled: z.boolean().default(true),
});

export const updateMcpServerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    transport: z.literal("streamable-http").optional(),
    url: z.string().url("Must be a valid URL").optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeout: z.number().int().min(1000).max(300000).optional(),
    retries: z.number().int().min(0).max(10).optional(),
    enabled: z.boolean().optional(),
  })
  .partial();

// Types
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
  temperature: z
    .number()
    .min(0)
    .max(2)
    .transform((val) => val.toString()),
});

export const selectAgentSchema = createSelectSchema(agent, {
  temperature: z.string().transform((val) => parseFloat(val)),
});

// API input schema - accepts numbers, validates, then transforms to strings for DB
export const createAgentSchema = insertAgentSchema
  .omit({
    id: true, // Exclude auto-generated fields
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
    userId: true, // Can't change ownership
    createdAt: true,
    updatedAt: true,
    deleted: true,
  })
  .partial() // Make all fields optional for updates
  .extend({
    temperature: z.number().min(0).max(2).optional(),
  })
  .transform((data) => ({
    ...data,
    temperature:
      data.temperature !== undefined ? data.temperature.toString() : undefined,
  }));
