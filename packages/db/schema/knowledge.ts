import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
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

export const knowledgeDocumentStatusEnum = pgEnum("knowledge_document_status", [
	"ready",
	"failed",
]);

export const memoryScopeEnum = pgEnum("memory_scope", [
	"user",
	"organization",
	"chat",
	"agent",
]);

export const knowledgeBase = pgTable(
	"knowledge_bases",
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
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("knowledge_bases_org_idx").on(t.organizationId, t.isArchived)],
);

export const knowledgeDocument = pgTable(
	"knowledge_documents",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		knowledgeBaseId: uuid("knowledge_base_id")
			.notNull()
			.references(() => knowledgeBase.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		content: text("content").notNull(),
		sourceKey: text("source_key"),
		contentType: text("content_type").notNull().default("text/plain"),
		status: knowledgeDocumentStatusEnum("status").notNull().default("ready"),
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
		index("knowledge_documents_base_idx").on(t.knowledgeBaseId, t.status),
		index("knowledge_documents_org_idx").on(t.organizationId),
	],
);

export const memory = pgTable(
	"memories",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatId: uuid("chat_id").references(() => chat.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id").references(() => agent.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scope: memoryScopeEnum("scope").notNull(),
		key: text("key").notNull(),
		content: text("content").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		sourceType: text("source_type").notNull().default("manual"),
		sourceId: text("source_id"),
		importance: integer("importance").notNull().default(50),
		isPinned: boolean("is_pinned").notNull().default(false),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("memories_org_idx").on(t.organizationId, t.scope),
		index("memories_chat_idx").on(t.chatId, t.updatedAt),
		index("memories_agent_idx").on(t.agentId, t.updatedAt),
		check(
			"memories_scope_target_check",
			sql`(
				(${t.scope} = 'user' AND ${t.userId} IS NOT NULL AND ${t.chatId} IS NULL AND ${t.agentId} IS NULL)
				OR (${t.scope} = 'organization' AND ${t.userId} IS NULL AND ${t.chatId} IS NULL AND ${t.agentId} IS NULL)
				OR (${t.scope} = 'chat' AND ${t.userId} IS NULL AND ${t.chatId} IS NOT NULL AND ${t.agentId} IS NULL)
				OR (${t.scope} = 'agent' AND ${t.userId} IS NULL AND ${t.chatId} IS NULL AND ${t.agentId} IS NOT NULL)
			)`,
		),
	],
);

export const memoryPreference = pgTable(
	"memory_preferences",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		savedMemoryEnabled: boolean("saved_memory_enabled").notNull().default(true),
		chatHistoryEnabled: boolean("chat_history_enabled").notNull().default(true),
		automaticManagementEnabled: boolean("automatic_management_enabled")
			.notNull()
			.default(true),
		summary: text("summary"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("memory_preferences_org_user_idx").on(
			t.organizationId,
			t.userId,
		),
	],
);

export const memoryHistory = pgTable(
	"memory_history",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		memoryId: uuid("memory_id")
			.notNull()
			.references(() => memory.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		content: text("content").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		importance: integer("importance").notNull().default(50),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("memory_history_memory_idx").on(t.memoryId, t.createdAt)],
);

export const knowledgeBaseRelations = relations(
	knowledgeBase,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [knowledgeBase.organizationId],
			references: [organization.id],
		}),
		creator: one(user, {
			fields: [knowledgeBase.createdBy],
			references: [user.id],
		}),
		documents: many(knowledgeDocument),
	}),
);

export const knowledgeDocumentRelations = relations(
	knowledgeDocument,
	({ one }) => ({
		knowledgeBase: one(knowledgeBase, {
			fields: [knowledgeDocument.knowledgeBaseId],
			references: [knowledgeBase.id],
		}),
		organization: one(organization, {
			fields: [knowledgeDocument.organizationId],
			references: [organization.id],
		}),
		creator: one(user, {
			fields: [knowledgeDocument.createdBy],
			references: [user.id],
		}),
	}),
);

export const memoryRelations = relations(memory, ({ one }) => ({
	organization: one(organization, {
		fields: [memory.organizationId],
		references: [organization.id],
	}),
	chat: one(chat, { fields: [memory.chatId], references: [chat.id] }),
	agent: one(agent, { fields: [memory.agentId], references: [agent.id] }),
	user: one(user, { fields: [memory.userId], references: [user.id] }),
	creator: one(user, { fields: [memory.createdBy], references: [user.id] }),
}));

export const memoryPreferenceRelations = relations(
	memoryPreference,
	({ one }) => ({
		organization: one(organization, {
			fields: [memoryPreference.organizationId],
			references: [organization.id],
		}),
		user: one(user, {
			fields: [memoryPreference.userId],
			references: [user.id],
		}),
	}),
);

export const memoryHistoryRelations = relations(memoryHistory, ({ one }) => ({
	memory: one(memory, {
		fields: [memoryHistory.memoryId],
		references: [memory.id],
	}),
	organization: one(organization, {
		fields: [memoryHistory.organizationId],
		references: [organization.id],
	}),
	user: one(user, { fields: [memoryHistory.userId], references: [user.id] }),
}));

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocument.$inferSelect;
export type Memory = typeof memory.$inferSelect;
export type MemoryPreference = typeof memoryPreference.$inferSelect;
export type MemoryHistory = typeof memoryHistory.$inferSelect;
