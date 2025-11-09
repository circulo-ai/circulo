import {
  boolean,
  check,
  decimal,
  index,
  integer, jsonb,
  numeric, pgEnum,
  pgTable,
  text,
  timestamp, unique,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "@/db/schema/auth";
import { agent } from "@/db/schema/agent";
import { knowledgeBase } from "@/db/schema/knowledge";
import { UIMessage } from "ai";

export const chatVisibilityEnum = pgEnum("chat_visibility", [
  "public",
  "private",
]);
export const chatStyleEnum = pgEnum("chat_style", [
  "brainstorm",
  "debate",
  "analyze",
  "custom",
]);

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),

    style: chatStyleEnum("style").notNull().default("brainstorm"),
    visibility: chatVisibilityEnum("visibility").notNull().default("private"),

    shareLink: text("share_link").unique(),
    linkEnabled: boolean("link_enabled").notNull().default(false),

    instructions: text("instructions"),

    messageCount: integer("message_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalCost: decimal("total_cost", { precision: 10, scale: 4 })
      .notNull()
      .default("0.0000"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("chat_user_id_idx").on(table.userId),
    visibilityIdx: index("chat_visibility_idx").on(table.visibility),
    shareLinkIdx: index("chat_share_link_idx").on(table.shareLink),
    userCreatedAtIdx: index("chat_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    countsNonNegative: check(
      "chat_counts_non_negative",
      sql`message_count >= 0 AND total_tokens >= 0 AND total_cost >= 0`
    ),
  }),
);

// Junction table: which agents participate in a chat
export const chatAgent = pgTable(
  "chat_agent",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    speakOrder: integer("speak_order").notNull(),
    enabled: boolean("enabled").notNull().default(true),

    // Custom configuration per chat (can override agent defaults)
    customSystemPrompt: text("custom_system_prompt"),
    customTemperature: numeric("custom_temperature", { precision: 3, scale: 2 }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("chat_agent_chat_id_idx").on(table.chatId),
    agentIdIdx: index("chat_agent_agent_id_idx").on(table.agentId),
    chatOrderIdx: index("chat_agent_chat_order_idx").on(
      table.chatId,
      table.speakOrder,
    ),
    uniqueChatAgentIdx: uniqueIndex("chat_agent_unique_idx").on(
      table.chatId,
      table.agentId,
    ),
    uniqueChatOrderIdx: unique("chat_agent_unique_order_idx").on(
      table.chatId,
      table.speakOrder,
    ),
    speakOrderNonNegative: check("chat_agent_speak_order_non_negative", sql`speak_order >= 0`),
  }),
);

export const chatKnowledgeBase = pgTable(
  "chat_knowledge_base",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),

    enabled: boolean("enabled").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("chat_kb_chat_id_idx").on(table.chatId),
    kbIdIdx: index("chat_kb_kb_id_idx").on(table.knowledgeBaseId),
    uniqueChatKbIdx: uniqueIndex("chat_kb_unique_idx").on(
      table.chatId,
      table.knowledgeBaseId,
    ),
  }),
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }),

    content: text("content").notNull(),

    tokenCount: integer("token_count").notNull().default(0),
    cost: decimal("cost", { precision: 10, scale: 6 }).default("0.000000"),

    toolCalls: jsonb("tool_calls").default("[]"),

    uiMessage: jsonb("ui_message").$type<UIMessage>(),

    quotedMessageId: text("quoted_message_id"),
    // quotedMessageId: text("quoted_message_id").references(() => message.id, { onDelete: "set null" }),

    // Agent mentions - which specific agents were mentioned
    mentionedAgentIds: jsonb("mentioned_agent_ids").$type<string[]>().default([]),

    // Knowledge base mentions - which KBs were mentioned/should be used
    mentionedKnowledgeBaseIds: jsonb("mentioned_knowledge_base_ids").$type<string[]>().default([]),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("message_chat_id_idx").on(table.chatId),
    userIdIdx: index("message_user_id_idx").on(table.userId),
    agentIdIdx: index("message_agent_id_idx").on(table.agentId),
    chatCreatedAtIdx: index("message_chat_created_at_idx").on(
      table.chatId,
      table.createdAt,
    ),
    quotedMessageIdx: index("message_quoted_idx").on(table.quotedMessageId),

    // Enforce at most one stored message per UI message id within a chat
    messageUiIdUniqueIdx: uniqueIndex("message_chat_ui_message_id_unique").on(
      table.chatId,
      sql`(ui_message ->> 'id')`
    ),

    senderCheck: check(
      "message_sender_check",
      sql`(user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL)`,
    ),
    countsNonNegative: check(
      "message_counts_non_negative",
      sql`token_count >= 0 AND cost >= 0`
    ),

    mentionedAgentsIdx: index("message_mentioned_agents_idx")
      .using("gin", table.mentionedAgentIds),
    mentionedKbsIdx: index("message_mentioned_kbs_idx")
      .using("gin", table.mentionedKnowledgeBaseIds),
  }),
);

// Chat types
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;

export type ChatVisibility = (typeof chatVisibilityEnum.enumValues)[number];
export type ChatStyle = (typeof chatStyleEnum.enumValues)[number];

export type ChatAgent = typeof chatAgent.$inferSelect;
export type NewChatAgent = typeof chatAgent.$inferInsert;

export type ChatKnowledgeBase = typeof chatKnowledgeBase.$inferSelect;
export type NewChatKnowledgeBase = typeof chatKnowledgeBase.$inferInsert;

// Message types
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
