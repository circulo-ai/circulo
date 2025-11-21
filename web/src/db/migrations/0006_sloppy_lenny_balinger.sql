ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_type_check";--> statement-breakpoint
ALTER TABLE "embeddings" DROP CONSTRAINT "embeddings_stats_check";--> statement-breakpoint
ALTER TABLE "knowledge_bases" DROP CONSTRAINT "knowledge_bases_stats_check";--> statement-breakpoint
ALTER TABLE "knowledge_documents" DROP CONSTRAINT "knowledge_documents_stats_check";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_type_check" CHECK (
          (type = 'organization' AND organization_id IS NOT NULL)
          OR
    (type = 'personal' AND organization_id IS NULL)
      );--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_stats_check" CHECK (
    chunk_index >= 0 AND token_count >= 0 AND
    (start_page IS NULL OR start_page >= 0) AND
    (end_page IS NULL OR end_page >= 0)
  );--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_stats_check" CHECK (document_count >= 0 AND total_tokens >= 0 AND total_size_bytes >= 0 AND embedding_dimension > 0);--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_stats_check" CHECK (file_size_bytes > 0 AND chunk_count >= 0 AND token_count >= 0);