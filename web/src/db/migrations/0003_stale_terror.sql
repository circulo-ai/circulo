CREATE TYPE "public"."chat_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "mcp_server" (
	"id" text PRIMARY KEY NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"mcp_server_id" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "message_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "agent_purchase" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_review" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_purchase" CASCADE;--> statement-breakpoint
DROP TABLE "agent_review" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_template" DROP CONSTRAINT "agent_template_price_non_negative";--> statement-breakpoint
ALTER TABLE "agent_template" DROP CONSTRAINT "agent_template_total_revenue_non_negative";--> statement-breakpoint
ALTER TABLE "agent_template" DROP CONSTRAINT "agent_template_rating_range";--> statement-breakpoint
ALTER TABLE "agent_template" DROP CONSTRAINT "agent_template_counts_non_negative";--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_counts_non_negative";--> statement-breakpoint
ALTER TABLE "knowledge_base" DROP CONSTRAINT "kb_counts_non_negative";--> statement-breakpoint
ALTER TABLE "agent_template" DROP CONSTRAINT "agent_template_creator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stream" DROP CONSTRAINT "stream_chatId_chat_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestion" DROP CONSTRAINT "suggestion_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestion" DROP CONSTRAINT "suggestion_documentId_documentCreatedAt_documents_id_createdAt_fk";
--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_chatId_chat_id_fk";
--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_messageId_message_id_fk";
--> statement-breakpoint
DROP INDEX "agent_usage_count_idx";--> statement-breakpoint
DROP INDEX "agent_template_is_marketplace_idx";--> statement-breakpoint
DROP INDEX "agent_template_marketplace_featured_idx";--> statement-breakpoint
DROP INDEX "agent_template_created_at_idx";--> statement-breakpoint
DROP INDEX "chat_user_id_idx";--> statement-breakpoint
DROP INDEX "chat_user_created_at_idx";--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_chatId_messageId_pk";--> statement-breakpoint
ALTER TABLE "agent_template" ALTER COLUMN "creator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ALTER COLUMN "processing_status" SET DEFAULT 'pending'::"public"."processing_status";--> statement-breakpoint
ALTER TABLE "knowledge_document" ALTER COLUMN "processing_status" SET DATA TYPE "public"."processing_status" USING "processing_status"::"public"."processing_status";--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chatId_messageId_userId_pk" PRIMARY KEY("chatId","messageId","userId");--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "tool_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_template" ADD COLUMN "tool_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_template" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "creator_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "type" "chat_type" DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "member_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD COLUMN "added_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD COLUMN "added_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind" varchar DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "chatId" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "mentioned_user_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "is_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding" ADD COLUMN "start_page" integer;--> statement-breakpoint
ALTER TABLE "embedding" ADD COLUMN "end_page" integer;--> statement-breakpoint
ALTER TABLE "embedding" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD COLUMN "total_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "processing_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "processing_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_mcp_server_id_mcp_server_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_server"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitation" ADD CONSTRAINT "chat_invitation_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_queue" ADD CONSTRAINT "document_processing_queue_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_server_user_id_idx" ON "mcp_server" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_server_is_system_idx" ON "mcp_server" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "mcp_server_endpoint_idx" ON "mcp_server" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "tool_user_id_idx" ON "tool" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_mcp_server_idx" ON "tool" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "tool_type_idx" ON "tool" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tool_is_system_idx" ON "tool" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "chat_invitation_chat_id_idx" ON "chat_invitation" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_inviter_id_idx" ON "chat_invitation" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_email_idx" ON "chat_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "chat_invitation_invitee_id_idx" ON "chat_invitation" USING btree ("invitee_id");--> statement-breakpoint
CREATE INDEX "chat_invitation_status_idx" ON "chat_invitation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_invitation_token_idx" ON "chat_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "chat_invitation_expires_at_idx" ON "chat_invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_member_chat_id_idx" ON "chat_member" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_member_user_id_idx" ON "chat_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_member_chat_user_idx" ON "chat_member" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_member_role_idx" ON "chat_member" USING btree ("role");--> statement-breakpoint
CREATE INDEX "message_reaction_message_id_idx" ON "message_reaction" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reaction_user_id_idx" ON "message_reaction" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reaction_unique_user_message_emoji_idx" ON "message_reaction" USING btree ("user_id","message_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_processing_queue_document_id_idx" ON "document_processing_queue" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_processing_queue_status_idx" ON "document_processing_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doc_processing_queue_priority_status_idx" ON "document_processing_queue" USING btree ("priority","status");--> statement-breakpoint
ALTER TABLE "agent_template" ADD CONSTRAINT "agent_template_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream" ADD CONSTRAINT "stream_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_documentId_documentCreatedAt_documents_id_createdAt_fk" FOREIGN KEY ("documentId","documentCreatedAt") REFERENCES "public"."documents"("id","createdAt") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_messageId_message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_template_is_system_idx" ON "agent_template" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "chat_creator_id_idx" ON "chat" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "chat_type_idx" ON "chat" USING btree ("type");--> statement-breakpoint
CREATE INDEX "chat_creator_created_at_idx" ON "chat" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_idx" ON "documents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "documents_chat_idx" ON "documents" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "message_mentioned_users_idx" ON "message" USING gin ("mentioned_user_ids");--> statement-breakpoint
CREATE INDEX "stream_chat_idx" ON "stream" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "suggestion_document_idx" ON "suggestion" USING btree ("documentId","documentCreatedAt");--> statement-breakpoint
CREATE INDEX "suggestion_user_idx" ON "suggestion" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "votes_message_idx" ON "votes" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "votes_user_idx" ON "votes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "document_kb_status_idx" ON "knowledge_document" USING btree ("knowledge_base_id","processing_status");--> statement-breakpoint
ALTER TABLE "agent" DROP COLUMN "tools";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "tools";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "is_marketplace";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "purchase_count";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "total_revenue";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "rating";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "review_count";--> statement-breakpoint
ALTER TABLE "agent_template" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "agent_template" ADD CONSTRAINT "agent_template_counts_non_negative" CHECK (instance_count >= 0 AND usage_count >= 0);--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_counts_non_negative" CHECK (message_count >= 0 AND member_count >= 0 AND total_tokens >= 0 AND total_cost >= 0);--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_pages_non_negative" CHECK ((start_page IS NULL OR start_page >= 0) AND (end_page IS NULL OR end_page >= 0));--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "kb_counts_non_negative" CHECK (document_count >= 0 AND total_tokens >= 0 AND total_size >= 0);--> statement-breakpoint
DROP TYPE "public"."agent_purchase_status";