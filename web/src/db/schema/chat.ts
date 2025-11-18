import { agent } from "@/db/schema/agent";
import { user } from "@/db/schema/auth";
import { knowledgeBase } from "@/db/schema/knowledge";
import { generateUUID } from "@/lib/utils";
import { sql } from "drizzle-orm";
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
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

export const chatVisibilityEnum = pgEnum("chat_visibility", [
  "private",
  "public",
]);

export const chatStyleEnum = pgEnum("chat_style", [
  "brainstorm",
  "debate",
  "analyze",
  "custom",
]);

export const chatTypeEnum = pgEnum("chat_type", [
  "direct", // 1-on-1 with AI
  "group", // Multiple users + AI agents
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

// Group chats with users and AI agents
export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),

    // Creator/owner of the chat
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),

    type: chatTypeEnum("type").notNull().default("direct"),
    style: chatStyleEnum("style").notNull().default("brainstorm"),
    visibility: chatVisibilityEnum("visibility").notNull().default("private"),

    // Sharing
    shareLink: text("share_link").unique(),
    linkEnabled: boolean("link_enabled").notNull().default(false),

    instructions: text("instructions"),

    // Stats
    messageCount: integer("message_count").notNull().default(0),
    memberCount: integer("member_count").notNull().default(1), // Including creator
    totalTokens: integer("total_tokens").notNull().default(0),
    totalCost: decimal("total_cost", { precision: 10, scale: 4 })
      .notNull()
      .default("0.0000"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    creatorIdIdx: index("chat_creator_id_idx").on(table.creatorId),
    typeIdx: index("chat_type_idx").on(table.type),
    visibilityIdx: index("chat_visibility_idx").on(table.visibility),
    shareLinkIdx: index("chat_share_link_idx").on(table.shareLink),
    creatorCreatedAtIdx: index("chat_creator_created_at_idx").on(
      table.creatorId,
      table.createdAt,
    ),
    countsNonNegative: check(
      "chat_counts_non_negative",
      sql`message_count >= 0 AND member_count >= 0 AND total_tokens >= 0 AND total_cost >= 0`,
    ),
  }),
);

// User members in a chat
export const chatMember = pgTable(
  "chat_member",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'

    // Permissions
    canInvite: boolean("can_invite").notNull().default(false),
    canManageAgents: boolean("can_manage_agents").notNull().default(false),
    canManageKnowledge: boolean("can_manage_knowledge")
      .notNull()
      .default(false),

    // Notifications
    notificationsEnabled: boolean("notifications_enabled")
      .notNull()
      .default(true),

    // Activity tracking
    lastReadAt: timestamp("last_read_at"),
    unreadCount: integer("unread_count").notNull().default(0),

    // Pinning (per member)
    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at"),
    pinOrder: integer("pin_order"),

    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    leftAt: timestamp("left_at"), // null if still active
  },
  (table) => ({
    chatIdIdx: index("chat_member_chat_id_idx").on(table.chatId),
    userIdIdx: index("chat_member_user_id_idx").on(table.userId),
    chatUserIdx: uniqueIndex("chat_member_chat_user_idx").on(
      table.chatId,
      table.userId,
    ),
    roleIdx: index("chat_member_role_idx").on(table.role),
    unreadCountNonNegative: check(
      "chat_member_unread_count_non_negative",
      sql`unread_count >= 0`,
    ),
    pinnedIdx: index("chat_member_user_pinned_idx").on(
      table.userId,
      table.isPinned,
    ),
    pinOrderUnique: uniqueIndex("chat_member_user_pin_order_unique").on(
      table.userId,
      table.pinOrder,
    ),
  }),
);

// Chat invitations (email-based)
export const chatInvitation = pgTable(
  "chat_invitation",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Invitee information
    email: text("email").notNull(),
    inviteeId: text("invitee_id").references(() => user.id, {
      onDelete: "cascade",
    }), // Set when user accepts

    role: text("role").notNull().default("member"),

    status: invitationStatusEnum("status").notNull().default("pending"),

    // Token for accepting invitation
    token: text("token").notNull().unique(),

    message: text("message"), // Optional personal message

    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("chat_invitation_chat_id_idx").on(table.chatId),
    inviterIdIdx: index("chat_invitation_inviter_id_idx").on(table.inviterId),
    emailIdx: index("chat_invitation_email_idx").on(table.email),
    inviteeIdIdx: index("chat_invitation_invitee_id_idx").on(table.inviteeId),
    statusIdx: index("chat_invitation_status_idx").on(table.status),
    tokenIdx: index("chat_invitation_token_idx").on(table.token),
    expiresAtIdx: index("chat_invitation_expires_at_idx").on(table.expiresAt),
  }),
);

// AI agents in a chat
export const chatAgent = pgTable(
  "chat_agent",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    speakOrder: integer("speak_order").notNull(),
    enabled: boolean("enabled").notNull().default(true),

    // Custom configuration per chat (can override agent defaults)
    customSystemPrompt: text("custom_system_prompt"),
    customTemperature: numeric("custom_temperature", {
      precision: 3,
      scale: 2,
    }),

    addedBy: text("added_by")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

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
    speakOrderNonNegative: check(
      "chat_agent_speak_order_non_negative",
      sql`speak_order >= 0`,
    ),
  }),
);

// Knowledge bases attached to chats
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

    addedBy: text("added_by")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

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

// Messages in chats
export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    // Sender (either user or agent)
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }),

    content: text("content").notNull(),

    tokenCount: integer("token_count").notNull().default(0),
    cost: decimal("cost", { precision: 10, scale: 6 }).default("0.000000"),

    role: varchar("role").notNull(),
    parts: jsonb("parts").notNull(),
    attachments: jsonb("attachments").notNull(),

    quotedMessageId: text("quoted_message_id"),

    // Message metadata
    isEdited: boolean("is_edited").notNull().default(false),
    editedAt: timestamp("edited_at"),

    deleted: boolean("deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at"),

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
    senderCheck: check(
      "message_sender_check",
      sql`(user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL)`,
    ),
    countsNonNegative: check(
      "message_counts_non_negative",
      sql`token_count >= 0 AND cost >= 0`,
    ),
  }),
);

// Message reactions
export const messageReaction = pgTable(
  "message_reaction",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    emoji: text("emoji").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    messageIdIdx: index("message_reaction_message_id_idx").on(table.messageId),
    userIdIdx: index("message_reaction_user_id_idx").on(table.userId),
    uniqueUserMessageEmojiIdx: uniqueIndex(
      "message_reaction_unique_user_message_emoji_idx",
    ).on(table.userId, table.messageId, table.emoji),
  }),
);

// Message votes (for artifacts/suggestions)
export const vote = pgTable(
  "votes",
  {
    chatId: text("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: text("messageId")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId, table.userId] }),
    messageIdx: index("votes_message_idx").on(table.messageId),
    userIdx: index("votes_user_idx").on(table.userId),
  }),
);

// Streaming state for artifacts
export const stream = pgTable(
  "stream",
  {
    id: text("id").notNull().$defaultFn(generateUUID),
    chatId: text("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatIdx: index("stream_chat_idx").on(table.chatId),
  }),
);

// Documents for artifacts
export const document = pgTable(
  "documents",
  {
    id: text("id").notNull().$defaultFn(generateUUID),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("kind", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: text("chatId").references(() => chat.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    userIdx: index("documents_user_idx").on(table.userId),
    chatIdx: index("documents_chat_idx").on(table.chatId),
  }),
);

// Suggestions for documents
export const suggestion = pgTable(
  "suggestion",
  {
    id: text("id").notNull().$defaultFn(generateUUID),
    documentId: text("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }).onDelete("cascade"),
    documentIdx: index("suggestion_document_idx").on(
      table.documentId,
      table.documentCreatedAt,
    ),
    userIdx: index("suggestion_user_idx").on(table.userId),
  }),
);

export const chatMemories = pgTable(
  "chat_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Memory belongs to a chat
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    // Memory belongs to a user (owner)
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Optional: which agent created this memory
    agentId: uuid("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }),

    // Short type: "fact", "preference", "conversation", etc.
    type: text("type").notNull(),

    // Main memory content
    content: text("content").notNull(),

    // Structured metadata
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),

    // Optional expiration to allow memory decay
    expiresAt: timestamp("expires_at"),

    // Soft delete
    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("chat_memory_chat_id_idx").on(table.chatId),
    index("chat_memory_owner_id_idx").on(table.ownerId),
    index("chat_memory_agent_id_idx").on(table.agentId),
    index("chat_memory_type_idx").on(table.type),
    index("chat_memory_expires_at_idx").on(table.expiresAt),
    index("chat_memory_metadata_gin_idx").using("gin", table.metadata),

    check("chat_memory_content_non_empty", sql`length(content) > 0`),
  ],
);

export const chatMemoryEmbeddings = pgTable(
  "chat_memory_embeddings",
  {
    id: serial("id").primaryKey(),

    memoryId: uuid("memory_id")
      .notNull()
      .references(() => chatMemories.id, { onDelete: "cascade" }),

    // Adjust this dimension to your embedding model (OpenAI = 1536)
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (table) => [
    index("chat_memory_embedding_memory_id_idx").on(table.memoryId),

    // Vector index (IVFFLAT or HNSW depending on pgvector version)
    // drizzle-kit will generate:
    // CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops)
    index("chat_memory_embedding_vector_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// Types
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatVisibility = (typeof chatVisibilityEnum.enumValues)[number];
export type ChatStyle = (typeof chatStyleEnum.enumValues)[number];
export type ChatType = (typeof chatTypeEnum.enumValues)[number];

export type ChatMember = typeof chatMember.$inferSelect;
export type NewChatMember = typeof chatMember.$inferInsert;

export type ChatInvitation = typeof chatInvitation.$inferSelect;
export type NewChatInvitation = typeof chatInvitation.$inferInsert;
export type InvitationStatus = (typeof invitationStatusEnum.enumValues)[number];

export type ChatAgent = typeof chatAgent.$inferSelect;
export type NewChatAgent = typeof chatAgent.$inferInsert;

export type ChatKnowledgeBase = typeof chatKnowledgeBase.$inferSelect;
export type NewChatKnowledgeBase = typeof chatKnowledgeBase.$inferInsert;

export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

export type MessageReaction = typeof messageReaction.$inferSelect;
export type NewMessageReaction = typeof messageReaction.$inferInsert;

export type Vote = typeof vote.$inferSelect;
export type Stream = typeof stream.$inferSelect;
export type Document = typeof document.$inferSelect;
export type Suggestion = typeof suggestion.$inferSelect;
