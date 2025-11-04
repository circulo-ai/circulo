import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { SQL, sql } from "drizzle-orm";
import { tsvector } from "@/db";
import { user } from "@/db/schema/auth";

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
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("kb_user_id_idx").on(table.userId),
    isPublicIdx: index("kb_is_public_idx").on(table.isPublic),
    countsNonNegative: check(
      "kb_counts_non_negative",
      sql`document_count >= 0 AND total_tokens >= 0`
    ),
    embeddingDimPositive: check(
      "kb_embedding_dimension_positive",
      sql`embedding_dimension > 0`
    ),
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
    fileSizePositive: check("document_file_size_positive", sql`file_size > 0`),
    countsNonNegative: check(
      "document_counts_non_negative",
      sql`chunk_count >= 0 AND token_count >= 0`
    ),
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
    chunkIndexNonNegative: check("embedding_chunk_index_non_negative", sql`chunk_index >= 0`),
    tokenCountNonNegative: check("embedding_token_count_non_negative", sql`token_count >= 0`),
  }),
);

// Knowledge Base types
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;

export type Embedding = typeof embedding.$inferSelect;
export type NewEmbedding = typeof embedding.$inferInsert;