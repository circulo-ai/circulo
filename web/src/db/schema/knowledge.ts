import { organization, user } from "@/db/schema/auth";
import { tsvector } from "@/db/schema/types";
import { SQL, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ==================== KNOWLEDGE BASES (Organization-scoped) ====================
export const knowledgeBase = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

    name: text("name").notNull(),
    description: text("description"),

    // Embedding configuration
    embeddingModel: text("embedding_model")
      .notNull()
      .default("text-embedding-3-small"),
    embeddingDimension: integer("embedding_dimension").notNull().default(1536),

    // Stats
    documentCount: integer("document_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalSizeBytes: integer("total_size_bytes").notNull().default(0),

    isPublic: boolean("is_public").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgIdx: index("knowledge_bases_org_idx").on(t.organizationId),
    orgNameIdx: uniqueIndex("knowledge_bases_org_name_idx").on(
      t.organizationId,
      t.name,
    ),
    statsCheck: check(
      "knowledge_bases_stats_check",
      sql`
        document_count
        >= 0 AND total_tokens >= 0 AND total_size_bytes >= 0 AND embedding_dimension > 0
      ,
    ),
  }),
);

// ==================== KNOWLEDGE DOCUMENTS ====================
export const knowledgeDocument = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    mimeType: text("mime_type").notNull(),

    // Optional metadata
    title: text("title"),
    author: text("author"),
    metadata: text("metadata"), // JSON string

    // Processing stats
    chunkCount: integer("chunk_count").notNull().default(0),
    tokenCount: integer("token_count").notNull().default(0),

    // Processing state
    processingStatus: processingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    processingError: text("processing_error"),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingCompletedAt: timestamp("processing_completed_at", {
      withTimezone: true,
    }),

    isDeleted: boolean("is_deleted").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    kbIdx: index("knowledge_documents_kb_idx").on(t.knowledgeBaseId),
    statusIdx: index("knowledge_documents_status_idx").on(t.processingStatus),
    kbStatusIdx: index("knowledge_documents_kb_status_idx").on(
      t.knowledgeBaseId,
      t.processingStatus,
    ),
    statsCheck: check(
      "knowledge_documents_stats_check",
      sql`
    file_size_bytes > 0 AND chunk_count >= 0 AND token_count >= 0
  `,
    ),
  }),
);

// ==================== EMBEDDINGS ====================
export const embedding = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),

    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),

    // Position metadata
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    metadata: text("metadata"), // JSON string

    // Vector embedding
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),

    // Full-text search
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', ${embedding.content})`,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kbIdx: index("embeddings_kb_idx").on(t.knowledgeBaseId),
    docIdx: index("embeddings_doc_idx").on(t.documentId),
    docChunkIdx: uniqueIndex("embeddings_doc_chunk_idx").on(
      t.documentId,
      t.chunkIndex,
    ),
    // HNSW index for vector similarity
    vectorIdx: index("embeddings_vector_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
    // Full-text search index
    ftsIdx: index("embeddings_fts_idx").using("gin", t.contentTsv),
    statsCheck: check(
      "embeddings_stats_check",
      sql`
    chunk_index >= 0 AND token_count >= 0 AND 
    (start_page IS NULL OR start_page >= 0) AND 
    (end_page IS NULL OR end_page >= 0)
  `,
    ),
  }),
);

// ==================== DOCUMENT PROCESSING QUEUE ====================
export const documentProcessingQueue = pgTable(
  "document_processing_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),

    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),

    status: processingStatusEnum("status").notNull().default("pending"),
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    documentIdx: uniqueIndex("doc_queue_document_idx").on(t.documentId),
    statusPriorityIdx: index("doc_queue_status_priority_idx").on(
      t.status,
      t.priority,
    ),
    attemptsCheck: check(
      "doc_queue_attempts_check",
      sql`attempts >= 0 AND max_attempts > 0`,
    ),
  }),
);

// ==================== TYPES ====================
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;
export type KnowledgeDocument = typeof knowledgeDocument.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocument.$inferInsert;
export type Embedding = typeof embedding.$inferSelect;
export type ProcessingStatus = (typeof processingStatusEnum.enumValues)[number];
