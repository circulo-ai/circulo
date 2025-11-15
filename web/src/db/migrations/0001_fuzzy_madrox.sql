CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"description" text,
	"transport" text NOT NULL,
	"url" text,
	"headers" json DEFAULT '{}',
	"timeout" integer DEFAULT 30000,
	"retries" integer DEFAULT 3,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_connected" timestamp,
	"connection_status" text DEFAULT 'disconnected',
	"last_error" text,
	"tool_count" integer DEFAULT 0,
	"last_tools_refresh" timestamp,
	"total_requests" integer DEFAULT 0,
	"last_used" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_environment" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"variables" json DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"variables" json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environment_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" uuid,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_memory_content_non_empty" CHECK (length(content) > 0)
);
--> statement-breakpoint
CREATE TABLE "chat_memory_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"memory_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_server" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "mcp_server" CASCADE;--> statement-breakpoint
ALTER TABLE "tool" DROP CONSTRAINT "tool_mcp_server_id_mcp_server_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_environment" ADD CONSTRAINT "chat_environment_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memory_embeddings" ADD CONSTRAINT "chat_memory_embeddings_memory_id_chat_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."chat_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_servers_chat_enabled_idx" ON "mcp_servers" USING btree ("chat_id","enabled");--> statement-breakpoint
CREATE INDEX "mcp_servers_chat_deleted_idx" ON "mcp_servers" USING btree ("chat_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_environment_chat_unique" ON "chat_environment" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_memory_chat_id_idx" ON "chat_memories" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_memory_owner_id_idx" ON "chat_memories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "chat_memory_agent_id_idx" ON "chat_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "chat_memory_type_idx" ON "chat_memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "chat_memory_expires_at_idx" ON "chat_memories" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_memory_metadata_gin_idx" ON "chat_memories" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "chat_memory_embedding_memory_id_idx" ON "chat_memory_embeddings" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "chat_memory_embedding_vector_idx" ON "chat_memory_embeddings" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE set null ON UPDATE no action;