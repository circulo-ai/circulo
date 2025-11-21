import { agent } from "@/db/schema/agent";
import { organization, user } from "@/db/schema/auth";
import { chat } from "@/db/schema/chat";
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
export const mcpTransportEnum = pgEnum("mcp_transport", [
  "stdio",
  "http",
  "websocket",
]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "connected",
  "disconnected",
  "error",
]);

// ==================== CUSTOM TOOLS (Organization-scoped) ====================
// These are user-defined tools with custom code
export const customTool = pgTable(
  "custom_tools",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    schema: json("schema").notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("custom_tools_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

// ==================== MCP SERVERS (Chat-scoped) ====================
// MCP servers are attached to specific chats
export const mcpServer = pgTable(
  "mcp_servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),

    // Connection config
    transport: mcpTransportEnum("transport").notNull(),
    url: text("url"),
    headers: jsonb("headers").$type<Record<string, string>>().default({}),
    timeout: integer("timeout").default(30000),
    retries: integer("retries").default(3),

    // State
    isEnabled: boolean("is_enabled").notNull().default(true),
    connectionStatus:
      connectionStatusEnum("connection_status").default("disconnected"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    lastError: text("last_error"),

    // Stats
    toolCount: integer("tool_count").default(0),
    lastToolsRefreshAt: timestamp("last_tools_refresh_at", {
      withTimezone: true,
    }),
    totalRequests: integer("total_requests").default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    chatIdx: index("mcp_servers_chat_idx").on(t.chatId),
    chatEnabledIdx: index("mcp_servers_chat_enabled_idx").on(
      t.chatId,
      t.isEnabled,
    ),
  }),
);

// ==================== MCP SERVER TOOLS (Discovered tools from MCP) ====================
// Tools discovered from MCP servers
export const mcpServerTool = pgTable(
  "mcp_server_tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => mcpServer.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    schema: jsonb("schema").$type<Record<string, unknown>>().notNull(),

    isEnabled: boolean("is_enabled").notNull().default(true),

    lastDiscoveredAt: timestamp("last_discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    serverIdx: index("mcp_server_tools_server_idx").on(t.mcpServerId),
    serverNameIdx: uniqueIndex("mcp_server_tools_server_name_idx").on(
      t.mcpServerId,
      t.name,
    ),
  }),
);

// ==================== AGENT TOOL CONFIGS (Per-agent tool settings) ====================
// Configuration for tools attached to specific agents
export const agentToolConfig = pgTable(
  "agent_tool_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    // Reference to tool (can be custom tool ID or built-in tool ID)
    toolId: text("tool_id").notNull(),
    toolType: text("tool_type").notNull(), // 'custom' | 'builtin' | 'mcp'

    // Instance-specific configuration (overrides defaults)
    config: json("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Environment variable overrides for this specific instance
    envOverrides: jsonb("env_overrides")
      .$type<Record<string, string>>()
      .default({}),

    isEnabled: boolean("is_enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    agentIdx: index("agent_tool_configs_agent_idx").on(t.agentId),
    agentToolIdx: index("agent_tool_configs_agent_tool_idx").on(
      t.agentId,
      t.toolId,
    ),
  }),
);

// ==================== TYPES ====================
export type CustomTool = typeof customTool.$inferSelect;
export type NewCustomTool = typeof customTool.$inferInsert;
export type McpServer = typeof mcpServer.$inferSelect;
export type NewMcpServer = typeof mcpServer.$inferInsert;
export type McpServerTool = typeof mcpServerTool.$inferSelect;
export type AgentToolConfig = typeof agentToolConfig.$inferSelect;
export type McpTransport = (typeof mcpTransportEnum.enumValues)[number];
export type ConnectionStatus = (typeof connectionStatusEnum.enumValues)[number];
