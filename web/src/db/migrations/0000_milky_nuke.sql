CREATE TYPE "public"."agent_purchase_status" AS ENUM('pending', 'completed', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."agent_template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('private', 'public', 'marketplace');--> statement-breakpoint
CREATE TYPE "public"."chat_style" AS ENUM('brainstorm', 'debate', 'analyze', 'custom');--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('public', 'private');--> statement-breakpoint
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
	"telegram_username" text,
	CONSTRAINT "account_provider_account_idx" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'gpt-4' NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 2000,
	"avatar" text,
	"color" text DEFAULT '#3B82F6',
	"tools" jsonb DEFAULT '[]',
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_usage_count_non_negative" CHECK (usage_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"template_id" text NOT NULL,
	"agent_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "agent_purchase_status" DEFAULT 'pending' NOT NULL,
	"creator_revenue" numeric(10, 2) NOT NULL,
	"platform_fee" numeric(10, 2) NOT NULL,
	"refunded_at" timestamp,
	"refund_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "agent_purchase_amount_non_negative" CHECK (amount >= 0),
	CONSTRAINT "agent_purchase_revenue_fee_non_negative" CHECK (creator_revenue >= 0 AND platform_fee >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_review" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"user_id" text NOT NULL,
	"purchase_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"comment" text,
	"helpful" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_review_user_template_unique" UNIQUE("user_id","template_id"),
	CONSTRAINT "agent_review_rating_range" CHECK (rating >= 1 AND rating <= 5),
	CONSTRAINT "agent_review_helpful_non_negative" CHECK (helpful >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_template" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"long_description" text,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'gpt-4' NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 2000,
	"avatar" text,
	"color" text DEFAULT '#3B82F6',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"tools" jsonb DEFAULT '[]',
	"status" "agent_template_status" DEFAULT 'draft' NOT NULL,
	"visibility" "agent_visibility" DEFAULT 'private' NOT NULL,
	"is_marketplace" boolean DEFAULT false NOT NULL,
	"price" numeric(10, 2) DEFAULT '0.00',
	"currency" text DEFAULT 'USD',
	"instance_count" integer DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(10, 2) DEFAULT '0.00',
	"rating" numeric(3, 2) DEFAULT '0.00',
	"review_count" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"slug" text,
	"featured" boolean DEFAULT false NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "agent_template_slug_unique" UNIQUE("slug"),
	CONSTRAINT "agent_template_price_non_negative" CHECK (price >= 0),
	CONSTRAINT "agent_template_total_revenue_non_negative" CHECK (total_revenue >= 0),
	CONSTRAINT "agent_template_counts_non_negative" CHECK (instance_count >= 0 AND purchase_count >= 0 AND review_count >= 0 AND usage_count >= 0),
	CONSTRAINT "agent_template_rating_range" CHECK (rating >= 0 AND rating <= 5)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"actor_type" text,
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	CONSTRAINT "chat_share_link_unique" UNIQUE("share_link"),
	CONSTRAINT "chat_counts_non_negative" CHECK (message_count >= 0 AND total_tokens >= 0 AND total_cost >= 0)
);
--> statement-breakpoint
CREATE TABLE "chat_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"speak_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"custom_system_prompt" text,
	"custom_temperature" numeric(3, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_agent_unique_order_idx" UNIQUE("chat_id","speak_order"),
	CONSTRAINT "chat_agent_speak_order_non_negative" CHECK (speak_order >= 0)
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_file_size_positive" CHECK (file_size > 0),
	CONSTRAINT "document_counts_non_negative" CHECK (chunk_count >= 0 AND token_count >= 0)
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_chunk_index_non_negative" CHECK (chunk_index >= 0),
	CONSTRAINT "embedding_token_count_non_negative" CHECK (token_count >= 0)
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_counts_non_negative" CHECK (document_count >= 0 AND total_tokens >= 0),
	CONSTRAINT "kb_embedding_dimension_positive" CHECK (embedding_dimension > 0)
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
	"ui_message" jsonb,
	"quoted_message_id" text,
	"mentioned_agent_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_sender_check" CHECK ((user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL)),
	CONSTRAINT "message_counts_non_negative" CHECK (token_count >= 0 AND cost >= 0)
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
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"bio" text,
	"is_creator" boolean DEFAULT false NOT NULL,
	"creator_verified" boolean DEFAULT false NOT NULL,
	"total_sales" numeric(10, 2) DEFAULT '0.00',
	"total_earnings" numeric(10, 2) DEFAULT '0.00',
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
	CONSTRAINT "wallet_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "wallet_balance_non_negative" CHECK (balance >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_balances_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" varchar(30) NOT NULL,
	"description" varchar(255) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"metadata" jsonb,
	"idempotency_key" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"description" varchar(255) NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_price" numeric(10, 4) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"billing_cycle" varchar(7) NOT NULL,
	"subscription_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"usage_fees" numeric(10, 2) DEFAULT '0' NOT NULL,
	"marketplace_fees" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" varchar(20) NOT NULL,
	"paid_at" timestamp,
	"due_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "marketplace_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"buyer_id" varchar(36) NOT NULL,
	"seller_id" varchar(36) NOT NULL,
	"item_type" varchar(30) NOT NULL,
	"item_id" varchar(36) NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"platform_fee" numeric(10, 2) NOT NULL,
	"seller_amount" numeric(10, 2) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"gateway" varchar(20) NOT NULL,
	"gateway_transaction_id" varchar(255),
	"type" varchar(30) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(20) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "payment_transactions_gateway_transaction_id_unique" UNIQUE("gateway_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"billing_period" varchar(20) NOT NULL,
	"quotas" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"status" varchar(20) NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_aggregates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"billing_cycle" varchar(7) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"total_quantity" bigint DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"resource_type" varchar(50),
	"quantity" integer NOT NULL,
	"metadata" jsonb,
	"billing_cycle" varchar(7),
	"billed" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_template_id_agent_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_purchase" ADD CONSTRAINT "agent_purchase_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_purchase" ADD CONSTRAINT "agent_purchase_template_id_agent_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_purchase" ADD CONSTRAINT "agent_purchase_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_review" ADD CONSTRAINT "agent_review_template_id_agent_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_review" ADD CONSTRAINT "agent_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_review" ADD CONSTRAINT "agent_review_purchase_id_agent_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."agent_purchase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_template" ADD CONSTRAINT "agent_template_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_user_id_idx" ON "agent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_template_id_idx" ON "agent" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "agent_user_template_idx" ON "agent" USING btree ("user_id","template_id");--> statement-breakpoint
CREATE INDEX "agent_usage_count_idx" ON "agent" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "agent_last_used_idx" ON "agent" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "agent_purchase_buyer_id_idx" ON "agent_purchase" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "agent_purchase_template_id_idx" ON "agent_purchase" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "agent_purchase_agent_id_idx" ON "agent_purchase" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_purchase_status_idx" ON "agent_purchase" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_purchase_created_at_idx" ON "agent_purchase" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_review_template_id_idx" ON "agent_review" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "agent_review_user_id_idx" ON "agent_review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_review_purchase_id_idx" ON "agent_review" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "agent_review_rating_idx" ON "agent_review" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "agent_review_created_at_idx" ON "agent_review" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_template_creator_id_idx" ON "agent_template" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "agent_template_status_idx" ON "agent_template" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_template_visibility_idx" ON "agent_template" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "agent_template_is_marketplace_idx" ON "agent_template" USING btree ("is_marketplace");--> statement-breakpoint
CREATE INDEX "agent_template_featured_idx" ON "agent_template" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "agent_template_slug_idx" ON "agent_template" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agent_template_marketplace_featured_idx" ON "agent_template" USING btree ("is_marketplace","featured","status");--> statement-breakpoint
CREATE INDEX "agent_template_created_at_idx" ON "agent_template" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
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
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_is_creator_idx" ON "user" USING btree ("is_creator");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "wallet_user_id_idx" ON "wallet" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_created_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_idempotency_idx" ON "credit_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_user_billing_cycle_idx" ON "invoices" USING btree ("user_id","billing_cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "marketplace_transactions_buyer_id_idx" ON "marketplace_transactions" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "marketplace_transactions_seller_id_idx" ON "marketplace_transactions" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "marketplace_transactions_status_idx" ON "marketplace_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_transactions_user_id_idx" ON "payment_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_gateway_tx_idx" ON "payment_transactions" USING btree ("gateway_transaction_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_aggregates_unique_idx" ON "usage_aggregates" USING btree ("user_id","billing_cycle","event_type");--> statement-breakpoint
CREATE INDEX "usage_aggregates_billing_cycle_idx" ON "usage_aggregates" USING btree ("billing_cycle");--> statement-breakpoint
CREATE INDEX "usage_events_user_timestamp_idx" ON "usage_events" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "usage_events_billing_cycle_idx" ON "usage_events" USING btree ("billing_cycle","billed");--> statement-breakpoint
CREATE INDEX "usage_events_event_type_idx" ON "usage_events" USING btree ("event_type");