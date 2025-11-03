import { UIMessage } from "ai";
import { relations, SQL, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  decimal,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  vector
} from "drizzle-orm/pg-core";

// ============================================================================
// CUSTOM TYPES
// ============================================================================

export const tsvector = customType<{ data: string }>({
  dataType() {
    return `tsvector`;
  },
});

// ============================================================================
// ENUMS
// ============================================================================

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
export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit",
  "withdrawal",
  "chat_usage",
  "embedding_usage",
  "agent_purchase",
  "agent_sale",
  "refund",
]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "completed",
  "failed",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "awaiting_payment",
  "completed",
  "failed",
  "cancelled",
  "refunded",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["sizpay"]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "day",
  "week",
  "month",
  "year",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "expired",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

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

export const agentPurchaseStatusEnum = pgEnum("agent_purchase_status", [
  "pending",
  "completed",
  "refunded",
  "disputed",
]);

// ============================================================================
// AUTH TABLES
// ============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  bio: text("bio"),

  // Creator profile
  isCreator: boolean("is_creator").notNull().default(false),
  creatorVerified: boolean("creator_verified").notNull().default(false),

  // Stats
  totalSales: decimal("total_sales", { precision: 10, scale: 2 }).default("0.00"),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 }).default("0.00"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  telegramId: text("telegram_id"),
  telegramUsername: text("telegram_username"),
}, (table) => ({
  emailIdx: index("user_email_idx").on(table.email),
  isCreatorIdx: index("user_is_creator_idx").on(table.isCreator),
}));

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
    tokenIdx: index("session_token_idx").on(table.token),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    telegramId: text("telegram_id"),
    telegramUsername: text("telegram_username"),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
    providerAccountIdx: unique("account_provider_account_idx").on(table.providerId, table.accountId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
);

// ============================================================================
// WALLET & TRANSACTIONS
// ============================================================================

export const wallet = pgTable(
  "wallet",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    balance: decimal("balance", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("wallet_user_id_idx").on(table.userId),
  }),
);

export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    type: transactionTypeEnum("type").notNull(),
    status: transactionStatusEnum("status").notNull().default("pending"),
    amount: decimal("amount", { precision: 10, scale: 4 }).notNull(),
    balanceBefore: decimal("balance_before", {
      precision: 10,
      scale: 2,
    }).notNull(),
    balanceAfter: decimal("balance_after", {
      precision: 10,
      scale: 2,
    }).notNull(),

    // Reference to related entities
    chatId: text("chat_id").references(() => chat.id, { onDelete: "set null" }),
    agentPurchaseId: text("agent_purchase_id").references(() => agentPurchase.id, { onDelete: "set null" }),

    description: text("description"),
    metadata: jsonb("metadata").default("{}"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("transaction_user_id_idx").on(table.userId),
    walletIdIdx: index("transaction_wallet_id_idx").on(table.walletId),
    chatIdIdx: index("transaction_chat_id_idx").on(table.chatId),
    agentPurchaseIdIdx: index("transaction_agent_purchase_id_idx").on(table.agentPurchaseId),
    typeIdx: index("transaction_type_idx").on(table.type),
    statusIdx: index("transaction_status_idx").on(table.status),
    createdAtIdx: index("transaction_created_at_idx").on(table.createdAt),
    userCreatedAtIdx: index("transaction_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").references(() => transaction.id, {
      onDelete: "set null",
    }),

    provider: paymentProviderEnum("provider").notNull().default("sizpay"),
    status: paymentStatusEnum("status").notNull().default("pending"),

    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("IRR"),

    providerToken: text("provider_token"),
    providerOrderId: text("provider_order_id"),
    providerTransactionId: text("provider_transaction_id"),
    providerRefNo: text("provider_ref_no"),
    providerTraceNo: text("provider_trace_no"),

    cardNumber: text("card_number"),

    callbackUrl: text("callback_url").notNull(),
    gatewayUrl: text("gateway_url"),

    metadata: text("metadata"),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => ({
    userIdIdx: index("payment_user_id_idx").on(table.userId),
    walletIdIdx: index("payment_wallet_id_idx").on(table.walletId),
    transactionIdIdx: index("payment_transaction_id_idx").on(
      table.transactionId,
    ),
    statusIdx: index("payment_status_idx").on(table.status),
    providerTokenIdx: index("payment_provider_token_idx").on(
      table.providerToken,
    ),
    providerOrderIdIdx: index("payment_provider_order_id_idx").on(
      table.providerOrderId,
    ),
    createdAtIdx: index("payment_created_at_idx").on(table.createdAt),
    userStatusIdx: index("payment_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

// ============================================================================
// AGENT TEMPLATES & MARKETPLACE
// ============================================================================

// Templates that creators publish - the "original" agents
export const agentTemplate = pgTable(
  "agent_template",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    longDescription: text("long_description"), // Markdown description for marketplace
    systemPrompt: text("system_prompt").notNull(),

    // Model configuration (defaults for instances)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", {
      precision: 3,
      scale: 2,
    })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Visual identity
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),
    tags: jsonb("tags").$type<string[]>().default([]),

    // Tools configuration
    tools: jsonb("tools").default("[]"),

    // Template status and visibility
    status: agentTemplateStatusEnum("status").notNull().default("draft"),
    visibility: agentVisibilityEnum("visibility").notNull().default("private"),

    // Marketplace info
    isMarketplace: boolean("is_marketplace").notNull().default(false),
    price: decimal("price", { precision: 10, scale: 2 }).default("0.00"),
    currency: text("currency").default("USD"),

    // Stats
    instanceCount: integer("instance_count").notNull().default(0), // How many agents created from this
    purchaseCount: integer("purchase_count").notNull().default(0),
    totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),
    rating: numeric("rating", { precision: 3, scale: 2 }).default("0.00"),
    reviewCount: integer("review_count").notNull().default(0),
    usageCount: integer("usage_count").notNull().default(0), // Total messages across all instances

    // SEO & Discovery
    slug: text("slug").unique(),
    featured: boolean("featured").notNull().default(false),

    // Version control
    version: text("version").notNull().default("1.0.0"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
  },
  (table) => ({
    creatorIdIdx: index("agent_template_creator_id_idx").on(table.creatorId),
    statusIdx: index("agent_template_status_idx").on(table.status),
    visibilityIdx: index("agent_template_visibility_idx").on(table.visibility),
    isMarketplaceIdx: index("agent_template_is_marketplace_idx").on(table.isMarketplace),
    featuredIdx: index("agent_template_featured_idx").on(table.featured),
    slugIdx: index("agent_template_slug_idx").on(table.slug),
    marketplaceFeaturedIdx: index("agent_template_marketplace_featured_idx").on(
      table.isMarketplace,
      table.featured,
      table.status
    ),
    createdAtIdx: index("agent_template_created_at_idx").on(table.createdAt),
  }),
);

// Agent instances - users' personalized versions
export const agent = pgTable(
  "agent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Link to template (nullable for custom agents not from marketplace)
    templateId: text("template_id").references(() => agentTemplate.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),

    // Model configuration (can override template defaults)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", {
      precision: 3,
      scale: 2,
    })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Avatar and styling
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),

    // Tools configuration
    tools: jsonb("tools").default("[]"),

    // Usage stats (for this instance)
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("agent_user_id_idx").on(table.userId),
    templateIdIdx: index("agent_template_id_idx").on(table.templateId),
    userTemplateIdx: index("agent_user_template_idx").on(
      table.userId,
      table.templateId,
    ),
    usageCountIdx: index("agent_usage_count_idx").on(table.usageCount),
    lastUsedIdx: index("agent_last_used_idx").on(table.lastUsedAt),
  }),
);

// Agent purchases from marketplace
export const agentPurchase = pgTable(
  "agent_purchase",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => agentTemplate.id, { onDelete: "restrict" }),
    agentId: text("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }), // The created agent instance

    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),

    status: agentPurchaseStatusEnum("status").notNull().default("pending"),

    // Revenue split (for creator)
    creatorRevenue: decimal("creator_revenue", { precision: 10, scale: 2 }).notNull(),
    platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),

    refundedAt: timestamp("refunded_at"),
    refundReason: text("refund_reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    buyerIdIdx: index("agent_purchase_buyer_id_idx").on(table.buyerId),
    templateIdIdx: index("agent_purchase_template_id_idx").on(table.templateId),
    agentIdIdx: index("agent_purchase_agent_id_idx").on(table.agentId),
    statusIdx: index("agent_purchase_status_idx").on(table.status),
    createdAtIdx: index("agent_purchase_created_at_idx").on(table.createdAt),
  }),
);

// Reviews for marketplace agents
export const agentReview = pgTable(
  "agent_review",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => agentTemplate.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => agentPurchase.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    comment: text("comment"),

    helpful: integer("helpful").notNull().default(0), // Helpful votes

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    templateIdIdx: index("agent_review_template_id_idx").on(table.templateId),
    userIdIdx: index("agent_review_user_id_idx").on(table.userId),
    purchaseIdIdx: index("agent_review_purchase_id_idx").on(table.purchaseId),
    uniqueUserTemplateIdx: unique("agent_review_user_template_unique").on(
      table.userId,
      table.templateId,
    ),
    ratingIdx: index("agent_review_rating_idx").on(table.rating),
    createdAtIdx: index("agent_review_created_at_idx").on(table.createdAt),
  }),
);

// ============================================================================
// KNOWLEDGE BASES
// ============================================================================

export const knowledgeBase = pgTable(
  "knowledge_base",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),

    embeddingModel: text("embedding_model")
      .notNull()
      .default("text-embedding-3-small"),
    embeddingDimension: integer("embedding_dimension").notNull().default(1536),

    documentCount: integer("document_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),

    isPublic: boolean("is_public").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("kb_user_id_idx").on(table.userId),
    isPublicIdx: index("kb_is_public_idx").on(table.isPublic),
  }),
);

export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),

    chunkCount: integer("chunk_count").notNull().default(0),
    tokenCount: integer("token_count").notNull().default(0),

    processingStatus: text("processing_status").notNull().default("pending"),
    processingError: text("processing_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    kbIdIdx: index("document_kb_id_idx").on(table.knowledgeBaseId),
    statusIdx: index("document_status_idx").on(table.processingStatus),
  }),
);

export const embedding = pgTable(
  "embedding",
  {
    id: text("id").primaryKey(),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),

    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),

    embedding: vector("embedding", { dimensions: 1536 }).notNull(),

    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', ${embedding.content})`,
    ),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    kbIdIdx: index("embedding_kb_id_idx").on(table.knowledgeBaseId),
    docIdIdx: index("embedding_doc_id_idx").on(table.documentId),
    docChunkIdx: uniqueIndex("embedding_doc_chunk_idx").on(
      table.documentId,
      table.chunkIndex,
    ),

    embeddingVectorIdx: index("embedding_vector_hnsw_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),

    contentFtsIdx: index("embedding_content_fts_idx").using(
      "gin",
      table.contentTsv,
    ),
  }),
);

// ============================================================================
// CHATS
// ============================================================================

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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("chat_user_id_idx").on(table.userId),
    visibilityIdx: index("chat_visibility_idx").on(table.visibility),
    shareLinkIdx: index("chat_share_link_idx").on(table.shareLink),
    userCreatedAtIdx: index("chat_user_created_at_idx").on(
      table.userId,
      table.createdAt,
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

// ============================================================================
// MESSAGES
// ============================================================================

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

    // Agent mentions - which specific agents were mentioned
    mentionedAgentIds: jsonb("mentioned_agent_ids").$type<string[]>().default([]),

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
  }),
);

// ============================================================================
// BILLING: PLANS, SUBSCRIPTIONS, INVOICES
// ============================================================================

export const subscriptionPlans = pgTable('subscription_plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  interval: text('interval').notNull(),
  intervalCount: integer('interval_count').notNull(),
  trialPeriodDays: integer('trial_period_days'),
  features: jsonb('features').$type<Record<string, any>>().notNull(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  activeIdx: index('subscription_plans_active_idx').on(table.active),
  intervalIdx: index('subscription_plans_interval_idx').on(table.interval)
}));

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  status: text('status').notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
  statusIdx: index('subscriptions_status_idx').on(table.status),
  planIdx: index('subscriptions_plan_id_idx').on(table.planId),
  currentPeriodEndIdx: index('subscriptions_current_period_end_idx').on(table.currentPeriodEnd)
}));

export const paymentMethods = pgTable('payment_methods', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  providerId: text('provider_id').notNull(),
  providerMethodId: text('provider_method_id').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  lastFour: text('last_four'),
  expiryMonth: integer('expiry_month'),
  expiryYear: integer('expiry_year'),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('payment_methods_user_id_idx').on(table.userId),
  providerMethodUnique: unique('payment_methods_provider_method_unique').on(table.providerId, table.providerMethodId),
  defaultIdx: index('payment_methods_is_default_idx').on(table.userId, table.isDefault)
}));

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  // Optional idempotency key to prevent duplicate payment creation
  idempotencyKey: text('idempotency_key'),
  status: text('status').notNull(),
  paymentMethodId: text('payment_method_id').notNull().references(() => paymentMethods.id, { onDelete: 'restrict' }),
  providerId: text('provider_id'),
  providerTransactionId: text('provider_transaction_id'),
  failureReason: text('failure_reason'),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('payments_user_id_idx').on(table.userId),
  subscriptionIdx: index('payments_subscription_id_idx').on(table.subscriptionId),
  statusIdx: index('payments_status_idx').on(table.status),
  providerTransactionUnique: unique('payments_provider_transaction_unique').on(table.providerId, table.providerTransactionId),
  idempotencyKeyUnique: unique('payments_idempotency_key_unique').on(table.idempotencyKey),
  createdAtIdx: index('payments_created_at_idx').on(table.createdAt)
}));

export const balances = pgTable('balances', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  availableAmount: numeric('available_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  availableCurrency: text('available_currency').notNull(),
  pendingAmount: numeric('pending_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  pendingCurrency: text('pending_currency').notNull(),
  reservedAmount: numeric('reserved_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  reservedCurrency: text('reserved_currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdUnique: unique('balances_user_id_unique').on(table.userId)
}));

export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  transactionId: text('transaction_id').notNull(),
  type: text('type').notNull(),
  transactionType: text('transaction_type').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  balanceAmount: numeric('balance_amount', { precision: 14, scale: 2 }).notNull(),
  balanceCurrency: text('balance_currency').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('ledger_entries_user_id_idx').on(table.userId),
  transactionIdx: index('ledger_entries_transaction_id_idx').on(table.transactionId),
  typeIdx: index('ledger_entries_type_idx').on(table.type),
  createdAtIdx: index('ledger_entries_created_at_idx').on(table.createdAt)
}));

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  number: text('number').notNull(),
  status: text('status').notNull(),
  subtotalAmount: numeric('subtotal_amount', { precision: 14, scale: 2 }).notNull(),
  subtotalCurrency: text('subtotal_currency').notNull(),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }),
  taxCurrency: text('tax_currency'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  totalCurrency: text('total_currency').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('invoices_user_id_idx').on(table.userId),
  subscriptionIdx: index('invoices_subscription_id_idx').on(table.subscriptionId),
  statusIdx: index('invoices_status_idx').on(table.status),
  numberUnique: unique('invoices_number_unique').on(table.number),
  dueDateIdx: index('invoices_due_date_idx').on(table.dueDate)
}));

export const invoiceLineItems = pgTable('invoice_line_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitAmount: numeric('unit_amount', { precision: 14, scale: 2 }).notNull(),
  unitCurrency: text('unit_currency').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  invoiceIdx: index('invoice_line_items_invoice_id_idx').on(table.invoiceId)
}));

export const usageRecords = pgTable('usage_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  metric: text('metric').notNull(),
  quantity: integer('quantity').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('usage_records_user_id_idx').on(table.userId),
  subscriptionIdx: index('usage_records_subscription_id_idx').on(table.subscriptionId),
  metricIdx: index('usage_records_metric_idx').on(table.metric),
  timestampIdx: index('usage_records_timestamp_idx').on(table.timestamp)
}));

export const usageMetrics = pgTable('usage_metrics', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  metric: text('metric').notNull(),
  unitPriceAmount: numeric('unit_price_amount', { precision: 14, scale: 2 }).notNull(),
  unitPriceCurrency: text('unit_price_currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  subscriptionIdx: index('usage_metrics_subscription_id_idx').on(table.subscriptionId),
  subscriptionMetricUnique: unique('usage_metrics_subscription_metric_unique').on(table.subscriptionId, table.metric)
}));

export const dunningCampaigns = pgTable('dunning_campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  steps: jsonb('steps').$type<{ dayOffset: number; action: string; config: Record<string, any> }[]>(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  nameUnique: unique('dunning_campaigns_name_unique').on(table.name),
  enabledIdx: index('dunning_campaigns_enabled_idx').on(table.enabled)
}));

export const dunningAttempts = pgTable('dunning_attempts', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  paymentId: text('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  status: text('status').notNull(),
  result: text('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  subscriptionIdx: index('dunning_attempts_subscription_id_idx').on(table.subscriptionId),
  paymentIdx: index('dunning_attempts_payment_id_idx').on(table.paymentId),
  statusIdx: index('dunning_attempts_status_idx').on(table.status),
  scheduledAtIdx: index('dunning_attempts_scheduled_at_idx').on(table.scheduledAt)
}));

export const dunningSubscriptionState = pgTable('dunning_subscription_state', {
  subscriptionId: text('subscription_id').primaryKey().references(() => subscriptions.id, { onDelete: 'cascade' }),
  paused: boolean('paused').notNull().default(false),
  pauseUntil: timestamp('pause_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  pausedIdx: index('dunning_subscription_state_paused_idx').on(table.paused),
  pauseUntilIdx: index('dunning_subscription_state_pause_until_idx').on(table.pauseUntil)
}));

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, any>>().notNull(),
  signature: text('signature'),
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  providerIdx: index('webhook_events_provider_id_idx').on(table.providerId),
  eventTypeIdx: index('webhook_events_event_type_idx').on(table.eventType),
  processedIdx: index('webhook_events_processed_idx').on(table.processed),
  createdAtIdx: index('webhook_events_created_at_idx').on(table.createdAt)
}));

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  actorId: text('actor_id'),
  actorType: text('actor_type'),
  changes: jsonb('changes').$type<Record<string, any> | null>(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  actorIdx: index('audit_logs_actor_idx').on(table.actorId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt)
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  wallet: one(wallet),
  agents: many(agent),
  agentTemplates: many(agentTemplate),
  agentPurchases: many(agentPurchase),
  agentReviews: many(agentReview),
  knowledgeBases: many(knowledgeBase),
  chats: many(chat),
  messages: many(message),
  transactions: many(transaction),
  subscriptions: many(subscriptions),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const walletRelations = relations(wallet, ({ one, many }) => ({
  user: one(user, {
    fields: [wallet.userId],
    references: [user.id],
  }),
  transactions: many(transaction),
  payments: many(payment),
}));

export const transactionRelations = relations(transaction, ({ one }) => ({
  user: one(user, {
    fields: [transaction.userId],
    references: [user.id],
  }),
  wallet: one(wallet, {
    fields: [transaction.walletId],
    references: [wallet.id],
  }),
  chat: one(chat, {
    fields: [transaction.chatId],
    references: [chat.id],
  }),
  agentPurchase: one(agentPurchase, {
    fields: [transaction.agentPurchaseId],
    references: [agentPurchase.id],
  }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  user: one(user, {
    fields: [payment.userId],
    references: [user.id],
  }),
  wallet: one(wallet, {
    fields: [payment.walletId],
    references: [wallet.id],
  }),
  transaction: one(transaction, {
    fields: [payment.transactionId],
    references: [transaction.id],
  }),
}));

// Agent Template Relations
export const agentTemplateRelations = relations(agentTemplate, ({ one, many }) => ({
  creator: one(user, {
    fields: [agentTemplate.creatorId],
    references: [user.id],
  }),
  instances: many(agent),
  purchases: many(agentPurchase),
  reviews: many(agentReview),
}));

// Agent Relations
export const agentRelations = relations(agent, ({ one, many }) => ({
  user: one(user, {
    fields: [agent.userId],
    references: [user.id],
  }),
  template: one(agentTemplate, {
    fields: [agent.templateId],
    references: [agentTemplate.id],
  }),
  chatAgents: many(chatAgent),
  messages: many(message),
}));

// Agent Purchase Relations
export const agentPurchaseRelations = relations(agentPurchase, ({ one, many }) => ({
  buyer: one(user, {
    fields: [agentPurchase.buyerId],
    references: [user.id],
  }),
  template: one(agentTemplate, {
    fields: [agentPurchase.templateId],
    references: [agentTemplate.id],
  }),
  agent: one(agent, {
    fields: [agentPurchase.agentId],
    references: [agent.id],
  }),
  transactions: many(transaction),
  reviews: many(agentReview),
}));

// Agent Review Relations
export const agentReviewRelations = relations(agentReview, ({ one }) => ({
  template: one(agentTemplate, {
    fields: [agentReview.templateId],
    references: [agentTemplate.id],
  }),
  user: one(user, {
    fields: [agentReview.userId],
    references: [user.id],
  }),
  purchase: one(agentPurchase, {
    fields: [agentReview.purchaseId],
    references: [agentPurchase.id],
  }),
}));

// Knowledge Base Relations
export const knowledgeBaseRelations = relations(
  knowledgeBase,
  ({ one, many }) => ({
    user: one(user, {
      fields: [knowledgeBase.userId],
      references: [user.id],
    }),
    documents: many(document),
    chatKnowledgeBases: many(chatKnowledgeBase),
  }),
);

export const documentRelations = relations(document, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBase, {
    fields: [document.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
  embeddings: many(embedding),
}));

export const embeddingRelations = relations(embedding, ({ one }) => ({
  knowledgeBase: one(knowledgeBase, {
    fields: [embedding.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
  document: one(document, {
    fields: [embedding.documentId],
    references: [document.id],
  }),
}));

// Chat Relations
export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
  chatAgents: many(chatAgent),
  chatKnowledgeBases: many(chatKnowledgeBase),
  transactions: many(transaction),
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
}));

export const chatKnowledgeBaseRelations = relations(
  chatKnowledgeBase,
  ({ one }) => ({
    chat: one(chat, {
      fields: [chatKnowledgeBase.chatId],
      references: [chat.id],
    }),
    knowledgeBase: one(knowledgeBase, {
      fields: [chatKnowledgeBase.knowledgeBaseId],
      references: [knowledgeBase.id],
    }),
  }),
);

// Message Relations
export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [message.userId],
    references: [user.id],
  }),
  agent: one(agent, {
    fields: [message.agentId],
    references: [agent.id],
  }),
  quotedMessage: one(message, {
    fields: [message.quotedMessageId],
    references: [message.id],
    relationName: "messageQuotes",
  }),
  quotes: many(message, {
    relationName: "messageQuotes",
  }),
}));

// Billing Relations
export const subscriptionPlanRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    subscriptions: many(subscriptions),
  }),
);

export const subscriptionRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  invoices: many(invoices),
  usageRecords: many(usageRecords),
  payments: many(payments),
}));

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  user: one(user, {
    fields: [invoices.userId],
    references: [user.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const paymentMethodRelations = relations(paymentMethods, ({ one }) => ({
  user: one(user, {
    fields: [paymentMethods.userId],
    references: [user.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(user, {
    fields: [payments.userId],
    references: [user.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [payments.paymentMethodId],
    references: [paymentMethods.id],
  }),
}));

export const balanceRelations = relations(balances, ({ one }) => ({
  user: one(user, {
    fields: [balances.userId],
    references: [user.id],
  }),
}));

export const ledgerEntryRelations = relations(ledgerEntries, ({ one }) => ({
  user: one(user, {
    fields: [ledgerEntries.userId],
    references: [user.id],
  }),
}));

export const usageRecordRelations = relations(usageRecords, ({ one }) => ({
  user: one(user, {
    fields: [usageRecords.userId],
    references: [user.id],
  }),
  subscription: one(subscriptions, {
    fields: [usageRecords.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const usageMetricRelations = relations(usageMetrics, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [usageMetrics.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// User types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

// Wallet & Transaction types
export type Wallet = typeof wallet.$inferSelect;
export type NewWallet = typeof wallet.$inferInsert;

export type Transaction = typeof transaction.$inferSelect;
export type NewTransaction = typeof transaction.$inferInsert;

export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus =
  (typeof transactionStatusEnum.enumValues)[number];

export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type PaymentProvider = (typeof paymentProviderEnum.enumValues)[number];

// Agent Template types
export type AgentTemplate = typeof agentTemplate.$inferSelect;
export type NewAgentTemplate = typeof agentTemplate.$inferInsert;
export type AgentVisibility = (typeof agentVisibilityEnum.enumValues)[number];
export type AgentTemplateStatus = (typeof agentTemplateStatusEnum.enumValues)[number];

// Agent types
export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

// Agent Purchase types
export type AgentPurchase = typeof agentPurchase.$inferSelect;
export type NewAgentPurchase = typeof agentPurchase.$inferInsert;
export type AgentPurchaseStatus = (typeof agentPurchaseStatusEnum.enumValues)[number];

// Agent Review types
export type AgentReview = typeof agentReview.$inferSelect;
export type NewAgentReview = typeof agentReview.$inferInsert;

// Knowledge Base types
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;

export type Embedding = typeof embedding.$inferSelect;
export type NewEmbedding = typeof embedding.$inferInsert;

// Chat types
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;

export type MessageWithAgent = Message & {
  agent: Agent | null;
};

export interface ChatWithRelations extends Chat {
  agents: (Agent & ChatAgent)[];
  knowledgeBases: { id: string; name: string; enabled: boolean }[];
  messages: MessageWithAgent[];
  user: { id: string; name: string; email: string };
}

export type ChatVisibility = (typeof chatVisibilityEnum.enumValues)[number];
export type ChatStyle = (typeof chatStyleEnum.enumValues)[number];

export type ChatAgent = typeof chatAgent.$inferSelect;
export type NewChatAgent = typeof chatAgent.$inferInsert;

export type ChatKnowledgeBase = typeof chatKnowledgeBase.$inferSelect;
export type NewChatKnowledgeBase = typeof chatKnowledgeBase.$inferInsert;

// Message types
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

// Billing types
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type UsageMetric = typeof usageMetrics.$inferSelect;
export type NewUsageMetric = typeof usageMetrics.$inferInsert;
export type Balance = typeof balances.$inferSelect;
export type NewBalance = typeof balances.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

// Audit Log types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;