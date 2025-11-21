import { agent } from "@/db/schema/agent";
import { organization, user } from "@/db/schema/auth";
import { knowledgeBase } from "@/db/schema/knowledge";
import { InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
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

// ==================== CHAT ====================
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
  (t) => ({
    orgIdx: index("chats_org_idx").on(t.organizationId),
    creatorIdx: index("chats_creator_idx").on(t.creatorId),
    orgCreatedIdx: index("chats_org_created_idx").on(
      t.organizationId,
      t.createdAt,
    ),
  }),
);

// ==================== CHAT MEMBERS ====================
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
  (t) => ({
    chatUserIdx: uniqueIndex("chat_members_chat_user_idx").on(
      t.chatId,
      t.userI,
    ),
    userIdx: index("chat_members_user_idx").on(t.userId),
    userPinnedIdx: index("chat_members_user_pinned_idx").on(
      t.userId,
      t.isPinned,
    ),
    unreadCheck: check(
      "chat_members_unread_check",
      sql`unread_count
    >= 0,
    ,
  }),
);

// ==================== CHAT INVITATIONS ====================
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
  (t) => ({
    chatIdx: index("chat_invitations_chat_idx").on(t.chatId),
    emailIdx: index("chat_invitations_email_idx").on(t.email),
    tokenIdx: index("chat_invitations_token_idx").on(t.token),
  }),
);

// ==================== CHAT AGENTS (Agent instances in chat) ====================
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
    customTemperature: numeric("custom_temperature", {
      precision: 3,
      scale: 2,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    chatAgentIdx: uniqueIndex("chat_agents_chat_agent_idx").on(
      t.chatId,
      t.agentId,
    ),
    chatIdx: index("chat_agents_chat_idx").on(t.chatId),
  }),
);

// ==================== CHAT KNOWLEDGE BASES ====================
export const chatKnowledgeBase = pgTable(
  "chat_knowledge_bases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),
    addedBy: text("added_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    isEnabled: boolean("is_enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    chatKbIdx: uniqueIndex("chat_kb_chat_kb_idx").on(
      t.chatId,
      t.knowledgeBaseId,
    ),
    chatIdx: index("chat_kb_chat_idx").on(t.chatId),
  }),
);

// ==================== MESSAGES ====================
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
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
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
  (t) => ({
    chatCreatedIdx: index("messages_chat_created_idx").on(
      t.chatId,
      t.createdAt,
    ),
    authorIdx: index("messages_author_idx").on(t.authorType, t.authorId),
    quotedIdx: index("messages_quoted_idx").on(t.quotedMessageId),
    costsCheck: check(
      "messages_costs_check",
      sql`token_count >= 0 AND cost >= 0`,
    ),
  }),
);

// ==================== MESSAGE REACTIONS ====================
export const messageReaction = pgTable(
  "message_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userMessageEmojiIdx: uniqueIndex("message_reactions_unique").on(
      t.userId,
      t.messageId,
      t.emoji,
    ),
    messageIdx: index("message_reactions_message_idx").on(t.messageId),
  }),
);

// ==================== VOTES ====================
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
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.messageId, t.userId] }),
  }),
);

// ==================== DOCUMENTS (Artifacts) ====================
export const document = pgTable(
  "documents",
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
  (t) => ({
    chatIdx: index("documents_chat_idx").on(t.chatId),
    userIdx: index("documents_user_idx").on(t.userId),
  }),
);

// ==================== SUGGESTIONS ====================
export const suggestion = pgTable(
  "suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
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
  (t) => ({
    documentIdx: index("suggestions_document_idx").on(t.documentId),
  }),
);

// ==================== TYPES ====================
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatMember = typeof chatMember.$inferSelect;
export type ChatAgent = typeof chatAgent.$inferSelect;
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type Document = typeof document.$inferSelect;
export type ChatVisibility = (typeof chatVisibilityEnum.enumValues)[number];
export type ChatType = (typeof chatTypeEnum.enumValues)[number];
export type Suggestion = InferSelectModel<typeof suggestion>;
export type Vote = InferSelectModel<typeof vote>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;
