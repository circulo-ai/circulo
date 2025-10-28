import { relations, SQL, sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  timestamp, 
  boolean, 
  integer,
  decimal,
  json,
  jsonb,
  index,
  uniqueIndex,
  vector,
  customType,
  pgEnum,
  pgView,
  uuid,
  check,
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

export const chatVisibilityEnum = pgEnum('chat_visibility', ['public', 'private']);
export const chatStyleEnum = pgEnum('chat_style', ['brainstorm', 'debate', 'analyze', 'custom']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'withdrawal', 
  'chat_usage',
  'embedding_usage',
  'refund'
]);
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'completed',
  'failed',
  'cancelled'
]);

// ============================================================================
// EXISTING AUTH TABLES (from your minimal schema)
// ============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  telegramId: text("telegram_id"),
  telegramUsername: text("telegram_username"),
});

export const session = pgTable("session", {
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
}, (table) => ({
  userIdIdx: index('session_user_id_idx').on(table.userId),
  tokenIdx: index('session_token_idx').on(table.token),
}));

export const account = pgTable("account", {
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
}, (table) => ({
  userIdIdx: index('account_user_id_idx').on(table.userId),
}));

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => ({
  identifierIdx: index('verification_identifier_idx').on(table.identifier),
}));

// ============================================================================
// WALLET & TRANSACTIONS
// ============================================================================

export const wallet = pgTable('wallet', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  balance: decimal('balance', { precision: 10, scale: 2 }).notNull().default('0.00'),
  currency: text('currency').notNull().default('USD'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('wallet_user_id_idx').on(table.userId),
}));

export const transaction = pgTable('transaction', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  walletId: text('wallet_id')
    .notNull()
    .references(() => wallet.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  status: transactionStatusEnum('status').notNull().default('pending'),
  amount: decimal('amount', { precision: 10, scale: 4 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 10, scale: 2 }).notNull(),
  
  // Reference to related entities
  chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
  
  description: text('description'),
  metadata: jsonb('metadata').default('{}'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('transaction_user_id_idx').on(table.userId),
  walletIdIdx: index('transaction_wallet_id_idx').on(table.walletId),
  chatIdIdx: index('transaction_chat_id_idx').on(table.chatId),
  typeIdx: index('transaction_type_idx').on(table.type),
  statusIdx: index('transaction_status_idx').on(table.status),
  createdAtIdx: index('transaction_created_at_idx').on(table.createdAt),
  userCreatedAtIdx: index('transaction_user_created_at_idx').on(table.userId, table.createdAt),
}));

// User-facing transaction view
export const userTransactionView = pgView('user_transaction_view').as((qb) => 
  qb.select({
    id: transaction.id,
    userId: transaction.userId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    balanceAfter: transaction.balanceAfter,
    description: transaction.description,
    chatId: transaction.chatId,
    createdAt: transaction.createdAt,
  })
  .from(transaction)
  .where(sql`${transaction.status} = 'completed'`)
);

// ============================================================================
// AGENTS
// ============================================================================

export const agent = pgTable('agent', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  
  // Model configuration
  model: text('model').notNull().default('gpt-4'),
  temperature: decimal('temperature', { precision: 3, scale: 2 }).default('0.7'),
  maxTokens: integer('max_tokens').default(2000),
  
  // Avatar and styling
  avatar: text('avatar'),
  color: text('color').default('#3B82F6'),
  
  // Visibility
  isPublic: boolean('is_public').notNull().default(false),
  
  // Tools configuration (JSON array of tool names/configs)
  tools: jsonb('tools').default('[]'),
  
  // Usage stats
  usageCount: integer('usage_count').notNull().default(0),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('agent_user_id_idx').on(table.userId),
  isPublicIdx: index('agent_is_public_idx').on(table.isPublic),
  userPublicIdx: index('agent_user_public_idx').on(table.userId, table.isPublic),
  usageCountIdx: index('agent_usage_count_idx').on(table.usageCount),
}));

// ============================================================================
// KNOWLEDGE BASES
// ============================================================================

export const knowledgeBase = pgTable('knowledge_base', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  description: text('description'),
  
  // Embedding configuration
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  embeddingDimension: integer('embedding_dimension').notNull().default(1536),
  
  // Stats
  documentCount: integer('document_count').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  
  isPublic: boolean('is_public').notNull().default(false),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('kb_user_id_idx').on(table.userId),
  isPublicIdx: index('kb_is_public_idx').on(table.isPublic),
}));

export const document = pgTable('document', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id')
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: 'cascade' }),
  
  filename: text('filename').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  
  chunkCount: integer('chunk_count').notNull().default(0),
  tokenCount: integer('token_count').notNull().default(0),
  
  processingStatus: text('processing_status').notNull().default('pending'),
  processingError: text('processing_error'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  kbIdIdx: index('document_kb_id_idx').on(table.knowledgeBaseId),
  statusIdx: index('document_status_idx').on(table.processingStatus),
}));

export const embedding = pgTable('embedding', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id')
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: 'cascade' }),
  documentId: text('document_id')
    .notNull()
    .references(() => document.id, { onDelete: 'cascade' }),
  
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  tokenCount: integer('token_count').notNull(),
  
  // Vector embedding
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  
  // Full-text search
  contentTsv: tsvector('content_tsv').generatedAlwaysAs(
    (): SQL => sql`to_tsvector('english', ${embedding.content})`
  ),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  kbIdIdx: index('embedding_kb_id_idx').on(table.knowledgeBaseId),
  docIdIdx: index('embedding_doc_id_idx').on(table.documentId),
  docChunkIdx: uniqueIndex('embedding_doc_chunk_idx').on(table.documentId, table.chunkIndex),
  
  // Vector similarity search (HNSW)
  embeddingVectorIdx: index('embedding_vector_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
    .with({ m: 16, ef_construction: 64 }),
  
  // Full-text search
  contentFtsIdx: index('embedding_content_fts_idx').using('gin', table.contentTsv),
}));

// ============================================================================
// CHATS
// ============================================================================

export const chat = pgTable('chat', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  title: text('title').notNull(),
  description: text('description'),
  
  // Chat configuration
  style: chatStyleEnum('style').notNull().default('brainstorm'),
  visibility: chatVisibilityEnum('visibility').notNull().default('private'),
  
  // Share link (for public/private accessible chats)
  shareLink: text('share_link').unique(),
  linkEnabled: boolean('link_enabled').notNull().default(false),
  
  // Custom instructions for the roundtable
  instructions: text('instructions'),
  
  // Usage tracking
  messageCount: integer('message_count').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  totalCost: decimal('total_cost', { precision: 10, scale: 4 }).notNull().default('0.0000'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('chat_user_id_idx').on(table.userId),
  visibilityIdx: index('chat_visibility_idx').on(table.visibility),
  shareLinkIdx: index('chat_share_link_idx').on(table.shareLink),
  userCreatedAtIdx: index('chat_user_created_at_idx').on(table.userId, table.createdAt),
}));

// Agent-Chat relationship (defines the order and which agents participate)
export const chatAgent = pgTable('chat_agent', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agent.id, { onDelete: 'cascade' }),
  
  // Order in the roundtable (who speaks after whom)
  speakOrder: integer('speak_order').notNull(),
  
  // Can be disabled without removing from chat
  enabled: boolean('enabled').notNull().default(true),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  chatIdIdx: index('chat_agent_chat_id_idx').on(table.chatId),
  agentIdIdx: index('chat_agent_agent_id_idx').on(table.agentId),
  chatOrderIdx: index('chat_agent_chat_order_idx').on(table.chatId, table.speakOrder),
  uniqueChatAgentIdx: uniqueIndex('chat_agent_unique_idx').on(table.chatId, table.agentId),
}));

// Knowledge Base-Chat relationship
export const chatKnowledgeBase = pgTable('chat_knowledge_base', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  knowledgeBaseId: text('knowledge_base_id')
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: 'cascade' }),
  
  enabled: boolean('enabled').notNull().default(true),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  chatIdIdx: index('chat_kb_chat_id_idx').on(table.chatId),
  kbIdIdx: index('chat_kb_kb_id_idx').on(table.knowledgeBaseId),
  uniqueChatKbIdx: uniqueIndex('chat_kb_unique_idx').on(table.chatId, table.knowledgeBaseId),
}));

// ============================================================================
// MESSAGES
// ============================================================================

export const message = pgTable('message', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  
  // Who sent the message (user or agent)
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  agentId: text('agent_id').references(() => agent.id, { onDelete: 'set null' }),
  
  content: text('content').notNull(),
  
  // Message metadata
  tokenCount: integer('token_count').notNull().default(0),
  cost: decimal('cost', { precision: 10, scale: 6 }).default('0.000000'),
  
  // Tool calls and results
  toolCalls: jsonb('tool_calls').default('[]'),
  
  // References for quotes/replies (self-reference)
  quotedMessageId: text('quoted_message_id'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  chatIdIdx: index('message_chat_id_idx').on(table.chatId),
  userIdIdx: index('message_user_id_idx').on(table.userId),
  agentIdIdx: index('message_agent_id_idx').on(table.agentId),
  chatCreatedAtIdx: index('message_chat_created_at_idx').on(table.chatId, table.createdAt),
  quotedMessageIdx: index('message_quoted_idx').on(table.quotedMessageId),
  
  // Ensure message is from either user or agent, not both
  senderCheck: check(
    'message_sender_check',
    sql`(user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL)`
  ),
}));

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  
  action: text('action').notNull(), // e.g., 'agent.create', 'chat.start', 'message.send'
  entityType: text('entity_type').notNull(), // e.g., 'agent', 'chat', 'message'
  entityId: text('entity_id'),
  
  details: jsonb('details').default('{}'),
  
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('audit_log_user_id_idx').on(table.userId),
  actionIdx: index('audit_log_action_idx').on(table.action),
  entityIdx: index('audit_log_entity_idx').on(table.entityType, table.entityId),
  createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
  userCreatedAtIdx: index('audit_log_user_created_at_idx').on(table.userId, table.createdAt),
}));

// ============================================================================
// RELATIONS (for self-referential and clarity)
// ============================================================================

// Self-referential foreign key for message quotes
// In your migration, add: 
// ALTER TABLE message ADD CONSTRAINT message_quoted_message_id_fk 
// FOREIGN KEY (quoted_message_id) REFERENCES message(id) ON DELETE SET NULL;

// User relations
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  wallet: one(wallet),
  agents: many(agent),
  knowledgeBases: many(knowledgeBase),
  chats: many(chat),
  messages: many(message),
  transactions: many(transaction),
  auditLogs: many(auditLog),
}));

// Session relations
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

// Account relations
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
}));

// Transaction relations
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
}));

// Agent relations
export const agentRelations = relations(agent, ({ one, many }) => ({
  user: one(user, {
    fields: [agent.userId],
    references: [user.id],
  }),
  chatAgents: many(chatAgent),
  messages: many(message),
}));

// Knowledge Base relations
export const knowledgeBaseRelations = relations(knowledgeBase, ({ one, many }) => ({
  user: one(user, {
    fields: [knowledgeBase.userId],
    references: [user.id],
  }),
  documents: many(document),
  chatKnowledgeBases: many(chatKnowledgeBase),
}));

// Document relations
export const documentRelations = relations(document, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBase, {
    fields: [document.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
  embeddings: many(embedding),
}));

// Embedding relations
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

// Chat relations
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

// ChatAgent (junction table) relations
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

// ChatKnowledgeBase (junction table) relations
export const chatKnowledgeBaseRelations = relations(chatKnowledgeBase, ({ one }) => ({
  chat: one(chat, {
    fields: [chatKnowledgeBase.chatId],
    references: [chat.id],
  }),
  knowledgeBase: one(knowledgeBase, {
    fields: [chatKnowledgeBase.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
}));

// Message relations
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
    relationName: 'messageQuotes',
  }),
  quotes: many(message, {
    relationName: 'messageQuotes',
  }),
}));

// Audit Log relations
export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
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

export type TransactionType = typeof transactionTypeEnum.enumValues[number];
export type TransactionStatus = typeof transactionStatusEnum.enumValues[number];

// Agent types
export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

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

export type ChatVisibility = typeof chatVisibilityEnum.enumValues[number];
export type ChatStyle = typeof chatStyleEnum.enumValues[number];

export type ChatAgent = typeof chatAgent.$inferSelect;
export type NewChatAgent = typeof chatAgent.$inferInsert;

export type ChatKnowledgeBase = typeof chatKnowledgeBase.$inferSelect;
export type NewChatKnowledgeBase = typeof chatKnowledgeBase.$inferInsert;

// Message types
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

// Audit Log types
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;