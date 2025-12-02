CREATE TYPE "public"."chat_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_author_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
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
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"created_by" text,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" text DEFAULT 'personal' NOT NULL,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "api_key_key_unique" UNIQUE("key"),
	CONSTRAINT "organization_type_check" CHECK ((type = 'organization' AND organization_id IS NOT NULL) OR (type = 'personal' AND organization_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
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
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"telemetry_enabled" boolean DEFAULT true NOT NULL,
	"email_preferences" json DEFAULT '{}' NOT NULL,
	"error_notifications_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_user_id_unique" UNIQUE("user_id")
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
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_rate_limits" (
	"reference_id" text PRIMARY KEY NOT NULL,
	"sync_api_requests" integer DEFAULT 0 NOT NULL,
	"async_api_requests" integer DEFAULT 0 NOT NULL,
	"api_endpoint_requests" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"last_request_at" timestamp DEFAULT now() NOT NULL,
	"is_rate_limited" boolean DEFAULT false NOT NULL,
	"rate_limit_reset_at" timestamp
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
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"avatar_url" text,
	"model" text DEFAULT 'gemini-2.5-flash' NOT NULL,
	"max_tokens" integer DEFAULT 1000,
	"temperature" integer DEFAULT 70,
	"is_archived" boolean DEFAULT false NOT NULL,
	"default_tool_ids" jsonb DEFAULT '[]'::jsonb,
	"default_knowledge_base_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"kind" varchar DEFAULT 'text' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"instructions" text,
	"type" "chat_type" DEFAULT 'direct' NOT NULL,
	"visibility" "chat_visibility" DEFAULT 'private' NOT NULL,
	"orchestration_enabled" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"added_by" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"custom_instructions" text,
	"custom_temperature" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"inviter_id" text NOT NULL,
	"email" text NOT NULL,
	"invitee_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"can_invite" boolean DEFAULT false NOT NULL,
	"can_manage_agents" boolean DEFAULT false NOT NULL,
	"can_manage_knowledge" boolean DEFAULT false NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"last_read_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp with time zone,
	"pin_order" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "chat_members_unread_check" CHECK (unread_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"author_type" "message_author_type" NOT NULL,
	"author_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"cost" numeric(12, 8) DEFAULT '0',
	"quoted_message_id" uuid,
	"is_edited" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_costs_check" CHECK (token_count >= 0 AND cost >= 0)
);
--> statement-breakpoint
CREATE TABLE "stream" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "stream_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"original_text" text NOT NULL,
	"suggested_text" text NOT NULL,
	"description" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"chat_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_upvoted" boolean NOT NULL,
	CONSTRAINT "votes_chat_id_message_id_user_id_pk" PRIMARY KEY("chat_id","message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "orchestration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"trigger_type" text,
	"webhook_source" text,
	"webhook_event" text,
	"webhook_payload" jsonb,
	"intent" text,
	"complexity" text,
	"domains" jsonb,
	"requires_multiple_agents" boolean,
	"estimated_steps" integer,
	"urgency" text,
	"key_entities" jsonb,
	"strategy" text,
	"selected_agent_ids" jsonb,
	"agent_tasks" jsonb,
	"reasoning" text,
	"stop_on_error" boolean DEFAULT false NOT NULL,
	"fallback_agent_id" uuid,
	"timeout_minutes" integer,
	"agent_results" jsonb,
	"summary" text,
	"detailed_response" text,
	"action_items" jsonb,
	"recommendations" jsonb,
	"overall_success" boolean,
	"execution_time_ms" integer NOT NULL,
	"total_token_count" integer,
	"total_cost" text,
	"success" boolean NOT NULL,
	"error" text,
	"error_stack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_progress" (
	"chat_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"current_agent" varchar(255),
	"completed_agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_agents" integer NOT NULL,
	"progress" integer NOT NULL,
	"estimated_time_remaining" integer,
	"last_update" timestamp NOT NULL,
	CONSTRAINT "workflow_progress_chat_id_message_id_pk" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents" ADD CONSTRAINT "chat_agents_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents" ADD CONSTRAINT "chat_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents" ADD CONSTRAINT "chat_agents_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations" ADD CONSTRAINT "chat_invitations_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations" ADD CONSTRAINT "chat_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations" ADD CONSTRAINT "chat_invitations_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream" ADD CONSTRAINT "stream_chatId_chats_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_document_id_artifacts_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_logs" ADD CONSTRAINT "orchestration_logs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_logs" ADD CONSTRAINT "orchestration_logs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agents_org_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agents_creator_idx" ON "agents" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_name_idx" ON "agents" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "artifacts_chat_idx" ON "artifacts" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "artifacts_user_idx" ON "artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chats_org_idx" ON "chats" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chats_creator_idx" ON "chats" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "chats_org_created_idx" ON "chats" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agents_chat_agent_idx" ON "chat_agents" USING btree ("chat_id","agent_id");--> statement-breakpoint
CREATE INDEX "chat_agents_chat_idx" ON "chat_agents" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitations_chat_idx" ON "chat_invitations" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitations_email_idx" ON "chat_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "chat_invitations_token_idx" ON "chat_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_members_chat_user_idx" ON "chat_members" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user_pinned_idx" ON "chat_members" USING btree ("user_id","is_pinned");--> statement-breakpoint
CREATE INDEX "messages_chat_created_idx" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_type","author_id");--> statement-breakpoint
CREATE INDEX "messages_quoted_idx" ON "messages" USING btree ("quoted_message_id");--> statement-breakpoint
CREATE INDEX "suggestions_document_idx" ON "suggestions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "orchestration_logs_chat_idx" ON "orchestration_logs" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "orchestration_logs_message_idx" ON "orchestration_logs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "orchestration_logs_created_idx" ON "orchestration_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orchestration_logs_success_idx" ON "orchestration_logs" USING btree ("success");--> statement-breakpoint
CREATE INDEX "orchestration_logs_strategy_idx" ON "orchestration_logs" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "orchestration_logs_trigger_idx" ON "orchestration_logs" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_workflow_progress_chat" ON "workflow_progress" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_progress_updated" ON "workflow_progress" USING btree ("last_update");