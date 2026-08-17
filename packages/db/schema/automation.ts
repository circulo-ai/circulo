import { relations } from "drizzle-orm";
import {
	boolean,
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
import { chat } from "./chat";

export const scheduledTaskStatusEnum = pgEnum("scheduled_task_status", [
	"active",
	"paused",
	"completed",
	"failed",
]);
export const scheduledTaskScheduleTypeEnum = pgEnum(
	"scheduled_task_schedule_type",
	["once", "interval", "cron"],
);
export const taskHandoffStatusEnum = pgEnum("task_handoff_status", [
	"pending",
	"accepted",
	"completed",
	"rejected",
	"cancelled",
]);
export const humanApprovalStatusEnum = pgEnum("human_approval_status", [
	"pending",
	"approved",
	"rejected",
	"expired",
	"cancelled",
]);
export const mcpScopeEnum = pgEnum("mcp_scope", [
	"organization",
	"chat",
	"agent",
]);
export const mcpTransportEnum = pgEnum("mcp_transport", [
	"sse",
	"streamable_http",
]);
export const mcpIntegrationStatusEnum = pgEnum("mcp_integration_status", [
	"draft",
	"published",
	"disabled",
]);
export const mcpToolApprovalModeEnum = pgEnum("mcp_tool_approval_mode", [
	"auto",
	"prompt",
	"writes",
	"approve",
]);

export const scheduledTask = pgTable(
	"scheduled_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatId: uuid("chat_id").references(() => chat.id, { onDelete: "set null" }),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		prompt: text("prompt").notNull(),
		scheduleType: scheduledTaskScheduleTypeEnum("schedule_type").notNull(),
		schedule: text("schedule").notNull(),
		timezone: text("timezone").notNull().default("UTC"),
		status: scheduledTaskStatusEnum("status").notNull().default("active"),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),
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
		index("scheduled_tasks_org_idx").on(t.organizationId, t.status),
		index("scheduled_tasks_due_idx").on(t.status, t.nextRunAt),
	],
);

export const taskHandoff = pgTable(
	"task_handoffs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatId: uuid("chat_id")
			.notNull()
			.references(() => chat.id, { onDelete: "cascade" }),
		fromAgentId: uuid("from_agent_id").references(() => agent.id, {
			onDelete: "set null",
		}),
		toAgentId: uuid("to_agent_id").references(() => agent.id, {
			onDelete: "set null",
		}),
		toUserId: text("to_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		task: text("task").notNull(),
		context: jsonb("context")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		status: taskHandoffStatusEnum("status").notNull().default("pending"),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("task_handoffs_chat_idx").on(t.chatId, t.createdAt),
		index("task_handoffs_recipient_idx").on(t.toAgentId, t.toUserId, t.status),
	],
);

export const humanApproval = pgTable(
	"human_approvals",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatId: uuid("chat_id")
			.notNull()
			.references(() => chat.id, { onDelete: "cascade" }),
		workflowRunId: text("workflow_run_id"),
		requestedBy: text("requested_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		approverUserId: text("approver_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		description: text("description").notNull(),
		requestedAction: jsonb("requested_action")
			.$type<Record<string, unknown>>()
			.notNull(),
		status: humanApprovalStatusEnum("status").notNull().default("pending"),
		decisionNote: text("decision_note"),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("human_approvals_chat_idx").on(t.chatId, t.status, t.createdAt),
		index("human_approvals_assignee_idx").on(t.approverUserId, t.status),
	],
);

export const mcpIntegration = pgTable(
	"mcp_integrations",
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
		transport: mcpTransportEnum("transport").notNull(),
		endpoint: text("endpoint").notNull(),
		credentialRef: text("credential_ref"),
		enabled: boolean("enabled").notNull().default(true),
		status: mcpIntegrationStatusEnum("status").notNull().default("draft"),
		lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
		lastScanError: text("last_scan_error"),
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
	(t) => [index("mcp_integrations_org_idx").on(t.organizationId, t.enabled)],
);

export const mcpTool = pgTable(
	"mcp_tools",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		integrationId: uuid("integration_id")
			.notNull()
			.references(() => mcpIntegration.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		title: text("title"),
		description: text("description"),
		inputSchema: jsonb("input_schema")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		readOnlyHint: boolean("read_only_hint"),
		enabled: boolean("enabled").notNull().default(false),
		approvalMode: mcpToolApprovalModeEnum("approval_mode")
			.notNull()
			.default("prompt"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("mcp_tools_integration_name_idx").on(t.integrationId, t.name),
		index("mcp_tools_integration_enabled_idx").on(t.integrationId, t.enabled),
	],
);

export const mcpIntegrationLink = pgTable(
	"mcp_integration_links",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		integrationId: uuid("integration_id")
			.notNull()
			.references(() => mcpIntegration.id, { onDelete: "cascade" }),
		scope: mcpScopeEnum("scope").notNull(),
		chatId: uuid("chat_id").references(() => chat.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id").references(() => agent.id, {
			onDelete: "cascade",
		}),
		enabled: boolean("enabled").notNull().default(true),
		allowedTools: jsonb("allowed_tools")
			.$type<string[]>()
			.notNull()
			.default([]),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("mcp_links_integration_idx").on(t.integrationId, t.enabled),
		index("mcp_links_chat_idx").on(t.chatId, t.enabled),
		index("mcp_links_agent_idx").on(t.agentId, t.enabled),
	],
);

export const automationRelations = relations(scheduledTask, ({ one }) => ({
	organization: one(organization, {
		fields: [scheduledTask.organizationId],
		references: [organization.id],
	}),
	chat: one(chat, { fields: [scheduledTask.chatId], references: [chat.id] }),
	creator: one(user, {
		fields: [scheduledTask.createdBy],
		references: [user.id],
	}),
}));

export const mcpIntegrationRelations = relations(
	mcpIntegration,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [mcpIntegration.organizationId],
			references: [organization.id],
		}),
		creator: one(user, {
			fields: [mcpIntegration.createdBy],
			references: [user.id],
		}),
		links: many(mcpIntegrationLink),
		tools: many(mcpTool),
	}),
);

export const mcpToolRelations = relations(mcpTool, ({ one }) => ({
	integration: one(mcpIntegration, {
		fields: [mcpTool.integrationId],
		references: [mcpIntegration.id],
	}),
}));

export const mcpIntegrationLinkRelations = relations(
	mcpIntegrationLink,
	({ one }) => ({
		integration: one(mcpIntegration, {
			fields: [mcpIntegrationLink.integrationId],
			references: [mcpIntegration.id],
		}),
		chat: one(chat, {
			fields: [mcpIntegrationLink.chatId],
			references: [chat.id],
		}),
		agent: one(agent, {
			fields: [mcpIntegrationLink.agentId],
			references: [agent.id],
		}),
	}),
);

export type ScheduledTask = typeof scheduledTask.$inferSelect;
export type TaskHandoff = typeof taskHandoff.$inferSelect;
export type HumanApproval = typeof humanApproval.$inferSelect;
export type McpIntegration = typeof mcpIntegration.$inferSelect;
export type McpIntegrationLink = typeof mcpIntegrationLink.$inferSelect;
export type McpTool = typeof mcpTool.$inferSelect;
