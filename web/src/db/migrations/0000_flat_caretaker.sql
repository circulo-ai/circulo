CREATE TYPE "public"."agent_template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('private', 'public', 'marketplace');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'failed', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('subscription', 'one_time', 'usage_based', 'addon', 'credit', 'refund', 'custom');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('changelly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'canceled', 'expired', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."chat_style" AS ENUM('brainstorm', 'debate', 'analyze', 'custom');--> statement-breakpoint
CREATE TYPE "public"."chat_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'gpt-4' NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 2000,
	"avatar" text,
	"color" text DEFAULT '#3B82F6',
	"tool_ids" jsonb DEFAULT '[]'::jsonb,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_usage_count_non_negative" CHECK (usage_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text,
	"name" text NOT NULL,
	"description" text,
	"long_description" text,
	"system_prompt" text NOT NULL,
	"category" text,
	"model" text DEFAULT 'gpt-4' NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 2000,
	"avatar" text,
	"color" text DEFAULT '#3B82F6',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"tool_ids" jsonb DEFAULT '[]'::jsonb,
	"status" "agent_template_status" DEFAULT 'draft' NOT NULL,
	"visibility" "agent_visibility" DEFAULT 'private' NOT NULL,
	"instance_count" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"slug" text,
	"featured" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "agent_template_slug_unique" UNIQUE("slug"),
	CONSTRAINT "agent_template_counts_non_negative" CHECK (instance_count >= 0 AND usage_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "mcp_server" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text,
	"endpoint" text NOT NULL,
	"auth_type" text DEFAULT 'none' NOT NULL,
	"auth_config" jsonb,
	"version" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"mcp_server_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" json,
	"org_usage_limit" numeric,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"telemetry_enabled" boolean DEFAULT true NOT NULL,
	"email_preferences" json DEFAULT '{}' NOT NULL,
	"billing_usage_notifications_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"stripe_customer_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_chat_executions" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric DEFAULT '0' NOT NULL,
	"current_usage_limit" numeric DEFAULT '10',
	"usage_limit_updated_at" timestamp DEFAULT now(),
	"current_period_cost" numeric DEFAULT '0' NOT NULL,
	"last_period_cost" numeric DEFAULT '0',
	"billed_overage_this_period" numeric DEFAULT '0' NOT NULL,
	"pro_period_cost_snapshot" numeric DEFAULT '0',
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"last_active" timestamp DEFAULT now() NOT NULL,
	"billing_blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"reference_type" varchar(100),
	"reference_id" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" integer,
	"type" "invoice_type" DEFAULT 'one_time' NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_invoice_id" varchar(255) NOT NULL,
	"usd_amount" numeric(10, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"description" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"failed_at" timestamp,
	"due_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"old_status" "subscription_status",
	"new_status" "subscription_status" NOT NULL,
	"reason" varchar(255),
	"metadata" jsonb,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" varchar(500),
	"usd_price" numeric(10, 2) NOT NULL,
	"billing_interval_days" integer DEFAULT 30 NOT NULL,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" integer NOT NULL,
	"status" "subscription_status" DEFAULT 'inactive' NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" integer,
	"metric" varchar(100) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"invoice_id" varchar(255),
	"payload" jsonb NOT NULL,
	"signature" text,
	"status" varchar(50) NOT NULL,
	"error_message" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "chat_type" DEFAULT 'direct' NOT NULL,
	"style" "chat_style" DEFAULT 'brainstorm' NOT NULL,
	"visibility" "chat_visibility" DEFAULT 'private' NOT NULL,
	"share_link" text,
	"link_enabled" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_share_link_unique" UNIQUE("share_link"),
	CONSTRAINT "chat_counts_non_negative" CHECK (message_count >= 0 AND member_count >= 0 AND total_tokens >= 0 AND total_cost >= 0)
);
--> statement-breakpoint
CREATE TABLE "chat_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"speak_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"custom_system_prompt" text,
	"custom_temperature" numeric(3, 2),
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_agent_unique_order_idx" UNIQUE("chat_id","speak_order"),
	CONSTRAINT "chat_agent_speak_order_non_negative" CHECK (speak_order >= 0)
);
--> statement-breakpoint
CREATE TABLE "chat_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"inviter_id" text NOT NULL,
	"email" text NOT NULL,
	"invitee_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"message" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "chat_knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_member" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"can_invite" boolean DEFAULT false NOT NULL,
	"can_manage_agents" boolean DEFAULT false NOT NULL,
	"can_manage_knowledge" boolean DEFAULT false NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"last_read_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	CONSTRAINT "chat_member_unread_count_non_negative" CHECK (unread_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"kind" varchar DEFAULT 'text' NOT NULL,
	"userId" text NOT NULL,
	"chatId" text,
	CONSTRAINT "documents_id_createdAt_pk" PRIMARY KEY("id","createdAt")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"cost" numeric(10, 6) DEFAULT '0.000000',
	"role" varchar NOT NULL,
	"parts" jsonb NOT NULL,
	"attachments" jsonb NOT NULL,
	"quoted_message_id" text,
	"is_edited" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_sender_check" CHECK ((user_id IS NOT NULL AND agent_id IS NULL) OR (user_id IS NULL AND agent_id IS NOT NULL)),
	CONSTRAINT "message_counts_non_negative" CHECK (token_count >= 0 AND cost >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream" (
	"id" text NOT NULL,
	"chatId" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "stream_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "suggestion" (
	"id" text NOT NULL,
	"documentId" text NOT NULL,
	"documentCreatedAt" timestamp NOT NULL,
	"originalText" text NOT NULL,
	"suggestedText" text NOT NULL,
	"description" text,
	"isResolved" boolean DEFAULT false NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "suggestion_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"chatId" text NOT NULL,
	"messageId" text NOT NULL,
	"userId" text NOT NULL,
	"isUpvoted" boolean NOT NULL,
	CONSTRAINT "votes_chatId_messageId_userId_pk" PRIMARY KEY("chatId","messageId","userId")
);
--> statement-breakpoint
CREATE TABLE "document_processing_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"status" "processing_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doc_processing_queue_attempts_non_negative" CHECK (attempts >= 0 AND max_attempts > 0)
);
--> statement-breakpoint
CREATE TABLE "embedding" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"document_id" text NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"metadata" text,
	"embedding" vector(1536) NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "embedding"."content")) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_chunk_index_non_negative" CHECK (chunk_index >= 0),
	CONSTRAINT "embedding_token_count_non_negative" CHECK (token_count >= 0),
	CONSTRAINT "embedding_pages_non_negative" CHECK ((start_page IS NULL OR start_page >= 0) AND (end_page IS NULL OR end_page >= 0))
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
	"total_size" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_counts_non_negative" CHECK (document_count >= 0 AND total_tokens >= 0 AND total_size >= 0),
	CONSTRAINT "kb_embedding_dimension_positive" CHECK (embedding_dimension > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_document" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"filename" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"title" text,
	"author" text,
	"metadata" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_file_size_positive" CHECK (file_size > 0),
	CONSTRAINT "document_counts_non_negative" CHECK (chunk_count >= 0 AND token_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_template_id_agent_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_template" ADD CONSTRAINT "agent_template_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_mcp_server_id_mcp_server_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_server"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream" ADD CONSTRAINT "stream_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_documentId_documentCreatedAt_documents_id_createdAt_fk" FOREIGN KEY ("documentId","documentCreatedAt") REFERENCES "public"."documents"("id","createdAt") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_messageId_message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_queue" ADD CONSTRAINT "document_processing_queue_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_user_id_idx" ON "agent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_template_id_idx" ON "agent" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "agent_user_template_idx" ON "agent" USING btree ("user_id","template_id");--> statement-breakpoint
CREATE INDEX "agent_last_used_idx" ON "agent" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "agent_template_creator_id_idx" ON "agent_template" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "agent_template_status_idx" ON "agent_template" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_template_visibility_idx" ON "agent_template" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "agent_template_featured_idx" ON "agent_template" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "agent_template_slug_idx" ON "agent_template" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agent_template_is_system_idx" ON "agent_template" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "mcp_server_user_id_idx" ON "mcp_server" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_server_is_system_idx" ON "mcp_server" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "mcp_server_endpoint_idx" ON "mcp_server" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "tool_user_id_idx" ON "tool" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_mcp_server_idx" ON "tool" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "tool_type_idx" ON "tool" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tool_is_system_idx" ON "tool" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "line_items_reference_idx" ON "invoice_line_items" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "invoices_provider_invoice_idx" ON "invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "history_subscription_idx" ON "subscription_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "history_changed_at_idx" ON "subscription_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "plans_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_end_date_idx" ON "subscriptions" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "usage_user_metric_period_idx" ON "usage_metrics" USING btree ("user_id","metric","period_start");--> statement-breakpoint
CREATE INDEX "usage_subscription_idx" ON "usage_metrics" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_provider_idx" ON "webhook_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "webhook_status_idx" ON "webhook_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_created_at_idx" ON "webhook_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_creator_id_idx" ON "chat" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "chat_type_idx" ON "chat" USING btree ("type");--> statement-breakpoint
CREATE INDEX "chat_visibility_idx" ON "chat" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "chat_share_link_idx" ON "chat" USING btree ("share_link");--> statement-breakpoint
CREATE INDEX "chat_creator_created_at_idx" ON "chat" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_agent_chat_id_idx" ON "chat_agent" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_agent_agent_id_idx" ON "chat_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "chat_agent_chat_order_idx" ON "chat_agent" USING btree ("chat_id","speak_order");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agent_unique_idx" ON "chat_agent" USING btree ("chat_id","agent_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_chat_id_idx" ON "chat_invitation" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_inviter_id_idx" ON "chat_invitation" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_email_idx" ON "chat_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "chat_invitation_invitee_id_idx" ON "chat_invitation" USING btree ("invitee_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_status_idx" ON "chat_invitation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_invitation_token_idx" ON "chat_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "chat_invitation_expires_at_idx" ON "chat_invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_kb_chat_id_idx" ON "chat_knowledge_base" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_kb_kb_id_idx" ON "chat_knowledge_base" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_kb_unique_idx" ON "chat_knowledge_base" USING btree ("chat_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "chat_member_chat_id_idx" ON "chat_member" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_member_user_id_idx" ON "chat_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_member_chat_user_idx" ON "chat_member" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_member_role_idx" ON "chat_member" USING btree ("role");--> statement-breakpoint
CREATE INDEX "documents_user_idx" ON "documents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "documents_chat_idx" ON "documents" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "message_chat_id_idx" ON "message" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_user_id_idx" ON "message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_agent_id_idx" ON "message" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "message_chat_created_at_idx" ON "message" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "message_quoted_idx" ON "message" USING btree ("quoted_message_id");--> statement-breakpoint
CREATE INDEX "message_reaction_message_id_idx" ON "message_reaction" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reaction_user_id_idx" ON "message_reaction" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reaction_unique_user_message_emoji_idx" ON "message_reaction" USING btree ("user_id","message_id","emoji");--> statement-breakpoint
CREATE INDEX "stream_chat_idx" ON "stream" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "suggestion_document_idx" ON "suggestion" USING btree ("documentId","documentCreatedAt");--> statement-breakpoint
CREATE INDEX "suggestion_user_idx" ON "suggestion" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "votes_message_idx" ON "votes" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "votes_user_idx" ON "votes" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_processing_queue_document_id_idx" ON "document_processing_queue" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_processing_queue_status_idx" ON "document_processing_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doc_processing_queue_priority_status_idx" ON "document_processing_queue" USING btree ("priority","status");--> statement-breakpoint
CREATE INDEX "embedding_kb_id_idx" ON "embedding" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "embedding_doc_id_idx" ON "embedding" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_doc_chunk_idx" ON "embedding" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "embedding_content_fts_idx" ON "embedding" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "kb_user_id_idx" ON "knowledge_base" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kb_is_public_idx" ON "knowledge_base" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "document_kb_id_idx" ON "knowledge_document" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "document_status_idx" ON "knowledge_document" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "document_kb_status_idx" ON "knowledge_document" USING btree ("knowledge_base_id","processing_status");