import { user } from "@/db/schema/auth";
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
  vector,
} from "drizzle-orm/pg-core";

export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// Knowledge bases for RAG
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
    totalSize: integer("total_size").notNull().default(0), // Total size in bytes

    isPublic: boolean("is_public").notNull().default(false),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("kb_user_id_idx").on(table.userId),
    isPublicIdx: index("kb_is_public_idx").on(table.isPublic),
    countsNonNegative: check(
      "kb_counts_non_negative",
      sql`document_count >= 0 AND total_tokens >= 0 AND total_size >= 0`,
    ),
    embeddingDimPositive: check(
      "kb_embedding_dimension_positive",
      sql`embedding_dimension > 0`,
    ),
  }),
);

// Documents within knowledge bases
export const knowledgeDocument = pgTable(
  "knowledge_document",
  {
    id: text("id").primaryKey(),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),

    // Document metadata
    title: text("title"),
    author: text("author"),
    metadata: text("metadata"), // JSON string for additional metadata

    chunkCount: integer("chunk_count").notNull().default(0),
    tokenCount: integer("token_count").notNull().default(0),

    processingStatus: processingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    processingError: text("processing_error"),
    processingStartedAt: timestamp("processing_started_at"),
    processingCompletedAt: timestamp("processing_completed_at"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    kbIdIdx: index("document_kb_id_idx").on(table.knowledgeBaseId),
    statusIdx: index("document_status_idx").on(table.processingStatus),
    kbStatusIdx: index("document_kb_status_idx").on(
      table.knowledgeBaseId,
      table.processingStatus,
    ),
    fileSizePositive: check("document_file_size_positive", sql`file_size > 0`),
    countsNonNegative: check(
      "document_counts_non_negative",
      sql`chunk_count >= 0 AND token_count >= 0`,
    ),
  }),
);

// Embeddings for document chunks
export const embedding = pgTable(
  "embedding",
  {
    id: text("id").primaryKey(),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBase.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),

    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),

    // Chunk metadata
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    metadata: text("metadata"), // JSON string for additional chunk metadata

    embedding: vector("embedding", { dimensions: 1536 }).notNull(),

    // Full-text search vector
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

    // HNSW index for vector similarity search
    embeddingVectorIdx: index("embedding_vector_hnsw_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),

    // Full-text search index
    contentFtsIdx: index("embedding_content_fts_idx").using(
      "gin",
      table.contentTsv,
    ),

    chunkIndexNonNegative: check(
      "embedding_chunk_index_non_negative",
      sql`chunk_index >= 0`,
    ),
    tokenCountNonNegative: check(
      "embedding_token_count_non_negative",
      sql`token_count >= 0`,
    ),
    pagesNonNegative: check(
      "embedding_pages_non_negative",
      sql`(start_page IS NULL OR start_page >= 0) AND (end_page IS NULL OR end_page >= 0)`,
    ),
  }),
);

// Document processing queue for async processing
export const documentProcessingQueue = pgTable(
  "document_processing_queue",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),

    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),

    status: processingStatusEnum("status").notNull().default("pending"),
    error: text("error"),

    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: uniqueIndex("doc_processing_queue_document_id_idx").on(
      table.documentId,
    ),
    statusIdx: index("doc_processing_queue_status_idx").on(table.status),
    priorityStatusIdx: index("doc_processing_queue_priority_status_idx").on(
      table.priority,
      table.status,
    ),
    attemptsNonNegative: check(
      "doc_processing_queue_attempts_non_negative",
      sql`attempts >= 0 AND max_attempts > 0`,
    ),
  }),
);

// Types
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;

export type KnowledgeDocument = typeof knowledgeDocument.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocument.$inferInsert;
export type ProcessingStatus = (typeof processingStatusEnum.enumValues)[number];

export type Embedding = typeof embedding.$inferSelect;
export type NewEmbedding = typeof embedding.$inferInsert;

export type DocumentProcessingQueue =
  typeof documentProcessingQueue.$inferSelect;
export type NewDocumentProcessingQueue =
  typeof documentProcessingQueue.$inferInsert;
