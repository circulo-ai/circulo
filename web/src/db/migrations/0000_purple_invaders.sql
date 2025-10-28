CREATE TYPE "public"."chat_style" AS ENUM('brainstorm', 'debate', 'analyze', 'custom');--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('deposit', 'withdrawal', 'chat_usage', 'embedding_usage', 'refund');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"telegram_id" text,
	"telegram_username" text
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'gpt-4' NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7',
	"max_tokens" integer DEFAULT 2000,
	"avatar" text,
	"color" text DEFAULT '#3B82F6',
	"is_public" boolean DEFAULT false NOT NULL,
	"tools" jsonb DEFAULT '[]',
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}',
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"style" "chat_style" DEFAULT 'brainstorm' NOT NULL,
	"visibility" "chat_visibility" DEFAULT 'private' NOT NULL,
	"share_link" text,
	"link_enabled" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_share_link_unique" UNIQUE("share_link")
);
--> statement-breakpoint
CREATE TABLE "chat_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"speak_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"filename" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"document_id" text NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "embedding"."content")) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"embedding_dimension" integer DEFAULT 1536 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text,
	"agent_id" text,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"cost" numeric(10, 6) DEFAULT '0.000000',
	"tool_calls" jsonb DEFAULT '[]',
	"quoted_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_sender_check" CHECK ((user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 4) NOT NULL,
	"balance_before" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"chat_id" text,
	"description" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"telegram_id" text,
	"telegram_username" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_user_id_idx" ON "agent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_is_public_idx" ON "agent" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "agent_user_public_idx" ON "agent" USING btree ("user_id","is_public");--> statement-breakpoint
CREATE INDEX "agent_usage_count_idx" ON "agent" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_created_at_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_user_id_idx" ON "chat" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_visibility_idx" ON "chat" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "chat_share_link_idx" ON "chat" USING btree ("share_link");--> statement-breakpoint
CREATE INDEX "chat_user_created_at_idx" ON "chat" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_agent_chat_id_idx" ON "chat_agent" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_agent_agent_id_idx" ON "chat_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "chat_agent_chat_order_idx" ON "chat_agent" USING btree ("chat_id","speak_order");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agent_unique_idx" ON "chat_agent" USING btree ("chat_id","agent_id");--> statement-breakpoint
CREATE INDEX "chat_kb_chat_id_idx" ON "chat_knowledge_base" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_kb_kb_id_idx" ON "chat_knowledge_base" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_kb_unique_idx" ON "chat_knowledge_base" USING btree ("chat_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "document_kb_id_idx" ON "document" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "document_status_idx" ON "document" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "embedding_kb_id_idx" ON "embedding" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "embedding_doc_id_idx" ON "embedding" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_doc_chunk_idx" ON "embedding" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "embedding_content_fts_idx" ON "embedding" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "kb_user_id_idx" ON "knowledge_base" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kb_is_public_idx" ON "knowledge_base" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "message_chat_id_idx" ON "message" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_user_id_idx" ON "message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_agent_id_idx" ON "message" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "message_chat_created_at_idx" ON "message" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "message_quoted_idx" ON "message" USING btree ("quoted_message_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "transaction_user_id_idx" ON "transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_wallet_id_idx" ON "transaction" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "transaction_chat_id_idx" ON "transaction" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "transaction_type_idx" ON "transaction" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transaction_status_idx" ON "transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transaction_created_at_idx" ON "transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transaction_user_created_at_idx" ON "transaction" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "wallet_user_id_idx" ON "wallet" USING btree ("user_id");--> statement-breakpoint
CREATE VIEW "public"."user_transaction_view" AS (select "id", "user_id", "type", "status", "amount", "balance_after", "description", "chat_id", "created_at" from "transaction" where "transaction"."status" = 'completed');