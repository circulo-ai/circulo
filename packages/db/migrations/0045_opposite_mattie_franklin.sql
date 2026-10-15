CREATE TABLE "embedding_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"document_id" uuid,
	"memory_id" uuid,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	CONSTRAINT "embedding_chunks_target_check" CHECK (("embedding_chunks"."document_id" IS NOT NULL AND "embedding_chunks"."memory_id" IS NULL) OR ("embedding_chunks"."memory_id" IS NOT NULL AND "embedding_chunks"."document_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "embedding_preferences" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embedding_chunks" ADD CONSTRAINT "embedding_chunks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_chunks" ADD CONSTRAINT "embedding_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_chunks" ADD CONSTRAINT "embedding_chunks_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_preferences" ADD CONSTRAINT "embedding_preferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedding_chunks_document_idx" ON "embedding_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "embedding_chunks_memory_idx" ON "embedding_chunks" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "embedding_chunks_vector_idx" ON "embedding_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_chunks_document_ordinal_idx" ON "embedding_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_chunks_memory_ordinal_idx" ON "embedding_chunks" USING btree ("memory_id","ordinal");--> statement-breakpoint
UPDATE "knowledge_documents" SET "embedding" = NULL, "embedding_model" = NULL, "embedding_updated_at" = NULL WHERE "embedding" IS NOT NULL;--> statement-breakpoint
UPDATE "memories" SET "embedding" = NULL, "embedding_model" = NULL, "embedding_updated_at" = NULL WHERE "embedding" IS NOT NULL;
