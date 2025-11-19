import { user } from "@/db/schema/auth";
import { chat } from "@/db/schema/chat";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";

// MCP (Model Context Protocol) Server definitions
// Must be defined before tool since tool references it
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

    headers: jsonb("headers").default({}),
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
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    chatEnabledIdx: index("mcp_servers_chat_enabled_idx").on(
      table.chatId,
      table.enabled,
    ),
    chatDeletedIdx: index("mcp_servers_chat_deleted_idx").on(
      table.chatId,
      table.deletedAt,
    ),
  }),
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
    mcpServerId: text("mcp_server_id").references(() => mcpServer.id, {
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
  (table) => ({
    userIdIdx: index("tool_user_id_idx").on(table.userId),
    mcpServerIdx: index("tool_mcp_server_idx").on(table.mcpServerId),
    typeIdx: index("tool_type_idx").on(table.type),
    isSystemIdx: index("tool_is_system_idx").on(table.isSystem),
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

export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;

export type McpServer = typeof mcpServer.$inferSelect;
export type NewMcpServer = typeof mcpServer.$inferInsert;
