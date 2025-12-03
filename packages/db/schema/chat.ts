import type { ChatTools, CustomUIDataTypes } from "@/lib/types";
import type { UIMessagePart } from "ai";
import { type InferSelectModel, relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { type Agent, agent } from "./agent";
import { organization, user } from "./auth";

export const chatVisibilityEnum = pgEnum("chat_visibility", [
  "private",
  "public",
]);
export const chatTypeEnum = pgEnum("chat_type", ["direct", "group"]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);
export const messageAuthorTypeEnum = pgEnum("message_author_type", [
  "user",
  "agent",
  "system",
]);

export const chat = pgTable(
  "chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    instructions: text("instructions"),

    type: chatTypeEnum("type").notNull().default("direct"),
    visibility: chatVisibilityEnum("visibility").notNull().default("private"),
    orchestrationEnabled: boolean("orchestration_enabled")
      .notNull()
      .default(true),

    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("chats_org_idx").on(t.organizationId),
    index("chats_creator_idx").on(t.creatorId),
    index("chats_org_created_idx").on(t.organizationId, t.createdAt),
  ]
);

export const chatMember = pgTable(
  "chat_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'
    canInvite: boolean("can_invite").notNull().default(false),
    canManageAgents: boolean("can_manage_agents").notNull().default(false),
    canManageKnowledge: boolean("can_manage_knowledge")
      .notNull()
      .default(false),

    notificationsEnabled: boolean("notifications_enabled")
      .notNull()
      .default(true),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),

    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinOrder: integer("pin_order"),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("chat_members_chat_user_idx").on(t.chatId, t.userId),
    index("chat_members_user_idx").on(t.userId),
    index("chat_members_user_pinned_idx").on(t.userId, t.isPinned),
    check("chat_members_unread_check", sql`unread_count >= 0`),
  ]
);

export const chatInvitation = pgTable(
  "chat_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    email: text("email").notNull(),
    inviteeId: text("invitee_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull().default("member"),
    status: invitationStatusEnum("status").notNull().default("pending"),

    token: text("token").notNull().unique(),
    message: text("message"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_invitations_chat_idx").on(t.chatId),
    index("chat_invitations_email_idx").on(t.email),
    index("chat_invitations_token_idx").on(t.token),
  ]
);

export const chatAgent = pgTable(
  "chat_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    addedBy: text("added_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    isEnabled: boolean("is_enabled").notNull().default(true),

    // Per-chat overrides
    customInstructions: text("custom_instructions"),
    customTemperature: integer("temperature").default(70),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_agents_chat_agent_idx").on(t.chatId, t.agentId),
    index("chat_agents_chat_idx").on(t.chatId),
  ]
);

export const message = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    authorType: messageAuthorTypeEnum("author_type").notNull(),
    authorId: text("author_id").notNull(), // userId or agentId

    role: text("role").notNull(), // 'user', 'assistant', 'system'
    content: text("content").notNull(),
    parts: jsonb("parts")
      .$type<UIMessagePart<CustomUIDataTypes, ChatTools>[]>()
      .notNull()
      .default([]),
    attachments: jsonb("attachments").$type<unknown[]>().notNull().default([]),

    tokenCount: integer("token_count").notNull().default(0),
    cost: decimal("cost", { precision: 12, scale: 8 }).default("0"),

    quotedMessageId: uuid("quoted_message_id"),
    isEdited: boolean("is_edited").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),

    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("messages_chat_created_idx").on(t.chatId, t.createdAt),
    index("messages_author_idx").on(t.authorType, t.authorId),
    index("messages_quoted_idx").on(t.quotedMessageId),
    check("messages_costs_check", sql`token_count >= 0 AND cost >= 0`),
  ]
);

export const vote = pgTable(
  "votes",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isUpvoted: boolean("is_upvoted").notNull(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.messageId, t.userId] })]
);

export const artifact = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id").references(() => chat.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("kind", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),

    version: integer("version").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("artifacts_chat_idx").on(t.chatId),
    index("artifacts_user_idx").on(t.userId),
  ]
);

export const suggestion = pgTable(
  "suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => artifact.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    originalText: text("original_text").notNull(),
    suggestedText: text("suggested_text").notNull(),
    description: text("description"),
    isResolved: boolean("is_resolved").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("suggestions_document_idx").on(t.documentId)]
);

export const stream = pgTable(
  "stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  ]
);

export const chatRelations = relations(chat, ({ one, many }) => ({
  organization: one(organization, {
    fields: [chat.organizationId],
    references: [organization.id],
  }),
  creator: one(user, {
    fields: [chat.creatorId],
    references: [user.id],
  }),
  members: many(chatMember),
  invitations: many(chatInvitation),
  agents: many(chatAgent),
  messages: many(message),
  artifacts: many(artifact),
  votes: many(vote),
  streams: many(stream),
}));

export const chatMemberRelations = relations(chatMember, ({ one }) => ({
  chat: one(chat, {
    fields: [chatMember.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [chatMember.userId],
    references: [user.id],
  }),
}));

export const chatInvitationRelations = relations(chatInvitation, ({ one }) => ({
  chat: one(chat, {
    fields: [chatInvitation.chatId],
    references: [chat.id],
  }),
  inviter: one(user, {
    fields: [chatInvitation.inviterId],
    references: [user.id],
    relationName: "inviter",
  }),
  invitee: one(user, {
    fields: [chatInvitation.inviteeId],
    references: [user.id],
    relationName: "invitee",
  }),
}));

export const chatAgentRelations = relations(chatAgent, ({ one }) => ({
  chat: one(chat, {
    fields: [chatAgent.chatId],
    references: [chat.id],
  }),
  agent: one(agent, {
    fields: [chatAgent.agentId],
    references: [agent.id],
  }),
  addedByUser: one(user, {
    fields: [chatAgent.addedBy],
    references: [user.id],
  }),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  quotedMessage: one(message, {
    fields: [message.quotedMessageId],
    references: [message.id],
    relationName: "quotedMessages",
  }),
  replies: many(message, { relationName: "quotedMessages" }),
  votes: many(vote),
}));

export const voteRelations = relations(vote, ({ one }) => ({
  chat: one(chat, {
    fields: [vote.chatId],
    references: [chat.id],
  }),
  message: one(message, {
    fields: [vote.messageId],
    references: [message.id],
  }),
  user: one(user, {
    fields: [vote.userId],
    references: [user.id],
  }),
}));

export const documentRelations = relations(artifact, ({ one, many }) => ({
  chat: one(chat, {
    fields: [artifact.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [artifact.userId],
    references: [user.id],
  }),
  suggestions: many(suggestion),
}));

export const suggestionRelations = relations(suggestion, ({ one }) => ({
  document: one(artifact, {
    fields: [suggestion.documentId],
    references: [artifact.id],
  }),
  user: one(user, {
    fields: [suggestion.userId],
    references: [user.id],
  }),
}));

export const streamRelations = relations(stream, ({ one }) => ({
  chat: one(chat, {
    fields: [stream.chatId],
    references: [chat.id],
  }),
}));

export type Stream = InferSelectModel<typeof stream>;
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatMember = typeof chatMember.$inferSelect;
export type ChatAgent = typeof chatAgent.$inferSelect;
export type ChatAgentWithAgent = ChatAgent & {
  agent: Agent;
};
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type Document = typeof artifact.$inferSelect;
export type ChatVisibility = (typeof chatVisibilityEnum.enumValues)[number];
export type ChatType = (typeof chatTypeEnum.enumValues)[number];
export type Suggestion = InferSelectModel<typeof suggestion>;
export type Vote = InferSelectModel<typeof vote>;
