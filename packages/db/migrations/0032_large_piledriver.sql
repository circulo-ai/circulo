CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "knowledge_documents_embedding_idx" ON "knowledge_documents" USING hnsw ("embedding" vector_cosine_ops);
