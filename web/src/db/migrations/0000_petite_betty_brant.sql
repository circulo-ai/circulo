CREATE TYPE "public"."permission_type" AS ENUM('admin', 'write', 'read');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('private', 'team', 'public');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chat_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_author_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('connected', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport" AS ENUM('stdio', 'http', 'websocket');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'failed', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('subscription', 'one_time', 'usage_based', 'addon', 'credit', 'refund', 'custom');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'changelly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'canceled', 'expired', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'api');--> statement-breakpoint
CREATE TABLE "accounts"
(
    "id"                       text PRIMARY KEY                       NOT NULL,
    "user_id"                  text                                   NOT NULL,
    "provider_id"              text                                   NOT NULL,
    "account_id"               text                                   NOT NULL,
    "access_token"             text,
    "refresh_token"            text,
    "id_token"                 text,
    "access_token_expires_at"  timestamp with time zone,
    "refresh_token_expires_at" timestamp with time zone,
    "scope"                    text,
    "password"                 text,
    "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at"               timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys"
(
    "id"              text PRIMARY KEY                            NOT NULL,
    "user_id"         text                                        NOT NULL,
    "organization_id" text,
    "created_by"      text,
    "name"            text                                        NOT NULL,
    "key_hash"        text                                        NOT NULL,
    "key_prefix"      text                                        NOT NULL,
    "type"            text                     DEFAULT 'personal' NOT NULL,
    "last_used"       timestamp with time zone,
    "expires_at"      timestamp with time zone,
    "created_at"      timestamp with time zone DEFAULT now()      NOT NULL,
    CONSTRAINT "api_keys_key_hash_unique" UNIQUE ("key_hash"),
    CONSTRAINT "api_keys_type_check" CHECK (
        (type = 'organization' AND organization_id IS NOT NULL) OR
        (type = 'personal' AND organization_id IS NULL)
        )
);
--> statement-breakpoint
CREATE TABLE "invitations"
(
    "id"              text PRIMARY KEY                           NOT NULL,
    "email"           text                                       NOT NULL,
    "inviter_id"      text                                       NOT NULL,
    "organization_id" text                                       NOT NULL,
    "role"            text                                       NOT NULL,
    "status"          text                     DEFAULT 'pending' NOT NULL,
    "expires_at"      timestamp with time zone                   NOT NULL,
    "created_at"      timestamp with time zone DEFAULT now()     NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"
(
    "id"              text PRIMARY KEY                          NOT NULL,
    "user_id"         text                                      NOT NULL,
    "organization_id" text                                      NOT NULL,
    "role"            text                     DEFAULT 'member' NOT NULL,
    "created_at"      timestamp with time zone DEFAULT now()    NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations"
(
    "id"                      text PRIMARY KEY                       NOT NULL,
    "name"                    text                                   NOT NULL,
    "slug"                    text                                   NOT NULL,
    "logo"                    text,
    "metadata"                jsonb,
    "org_usage_limit"         numeric(10, 2),
    "storage_used_bytes"      bigint                   DEFAULT 0     NOT NULL,
    "allow_personal_api_keys" boolean                  DEFAULT true  NOT NULL,
    "created_at"              timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at"              timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "organizations_slug_unique" UNIQUE ("slug")
);
--> statement-breakpoint
CREATE TABLE "permissions"
(
    "id"              text PRIMARY KEY                       NOT NULL,
    "user_id"         text                                   NOT NULL,
    "entity_type"     text                                   NOT NULL,
    "entity_id"       text                                   NOT NULL,
    "permission_type" "permission_type"                      NOT NULL,
    "created_at"      timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions"
(
    "id"                     text PRIMARY KEY                       NOT NULL,
    "user_id"                text                                   NOT NULL,
    "token"                  text                                   NOT NULL,
    "expires_at"             timestamp with time zone               NOT NULL,
    "ip_address"             text,
    "user_agent"             text,
    "active_organization_id" text,
    "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at"             timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "sessions_token_unique" UNIQUE ("token")
);
--> statement-breakpoint
CREATE TABLE "settings"
(
    "user_id"                             text PRIMARY KEY                          NOT NULL,
    "theme"                               text                     DEFAULT 'system' NOT NULL,
    "telemetry_enabled"                   boolean                  DEFAULT true     NOT NULL,
    "email_preferences"                   jsonb                    DEFAULT '{}'::jsonb NOT NULL,
    "billing_usage_notifications_enabled" boolean                  DEFAULT true     NOT NULL,
    "updated_at"                          timestamp with time zone DEFAULT now()    NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users"
(
    "id"                 text PRIMARY KEY                       NOT NULL,
    "name"               text                                   NOT NULL,
    "email"              text                                   NOT NULL,
    "email_verified"     boolean                  DEFAULT false NOT NULL,
    "image"              text,
    "stripe_customer_id" text,
    "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at"         timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "users_email_unique" UNIQUE ("email")
);
--> statement-breakpoint
CREATE TABLE "user_stats"
(
    "user_id"                    text PRIMARY KEY                       NOT NULL,
    "total_chat_executions"      integer                  DEFAULT 0     NOT NULL,
    "total_tokens_used"          integer                  DEFAULT 0     NOT NULL,
    "total_cost"                 numeric(12, 6)           DEFAULT '0'   NOT NULL,
    "current_usage_limit"        numeric(10, 2)           DEFAULT '10',
    "usage_limit_updated_at"     timestamp with time zone DEFAULT now(),
    "current_period_cost"        numeric(12, 6)           DEFAULT '0'   NOT NULL,
    "last_period_cost"           numeric(12, 6)           DEFAULT '0',
    "billed_overage_this_period" numeric(12, 6)           DEFAULT '0'   NOT NULL,
    "pro_period_cost_snapshot"   numeric(12, 6)           DEFAULT '0',
    "storage_used_bytes"         bigint                   DEFAULT 0     NOT NULL,
    "last_active"                timestamp with time zone DEFAULT now() NOT NULL,
    "billing_blocked"            boolean                  DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications"
(
    "id"         text PRIMARY KEY         NOT NULL,
    "identifier" text                     NOT NULL,
    "value"      text                     NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agents"
(
    "id"                         uuid PRIMARY KEY         DEFAULT gen_random_uuid()  NOT NULL,
    "organization_id"            text                                                NOT NULL,
    "created_by"                 text                                                NOT NULL,
    "name"                       text                                                NOT NULL,
    "description"                text,
    "instructions"               text                                                NOT NULL,
    "avatar_url"                 text,
    "model"                      text                     DEFAULT 'gemini-2.5-flash' NOT NULL,
    "max_tokens"                 integer                  DEFAULT 1000,
    "temperature"                integer                  DEFAULT 70,
    "visibility"                 "agent_visibility"       DEFAULT 'team'             NOT NULL,
    "is_archived"                boolean                  DEFAULT false              NOT NULL,
    "default_tool_ids"           jsonb                    DEFAULT '[]'::jsonb,
    "default_knowledge_base_ids" jsonb                    DEFAULT '[]'::jsonb,
    "metadata"                   jsonb,
    "created_at"                 timestamp with time zone DEFAULT now()              NOT NULL,
    "updated_at"                 timestamp with time zone DEFAULT now()              NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processing_queue"
(
    "id"           uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "document_id"  uuid                                               NOT NULL,
    "priority"     integer                  DEFAULT 0                 NOT NULL,
    "attempts"     integer                  DEFAULT 0                 NOT NULL,
    "max_attempts" integer                  DEFAULT 3                 NOT NULL,
    "status"       "processing_status"      DEFAULT 'pending'         NOT NULL,
    "error"        text,
    "started_at"   timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at"   timestamp with time zone DEFAULT now()             NOT NULL,
    CONSTRAINT "doc_queue_attempts_check" CHECK (attempts >= 0 AND max_attempts > 0)
);
--> statement-breakpoint
CREATE TABLE "embeddings"
(
    "id"                uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "knowledge_base_id" uuid                                               NOT NULL,
    "document_id"       uuid                                               NOT NULL,
    "content"           text                                               NOT NULL,
    "chunk_index"       integer                                            NOT NULL,
    "token_count"       integer                                            NOT NULL,
    "start_page"        integer,
    "end_page"          integer,
    "metadata"          text,
    "embedding"         vector(1536) NOT NULL,
    "content_tsv"       "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "embeddings"."content")) STORED,
    "created_at"        timestamp with time zone DEFAULT now()             NOT NULL,
    CONSTRAINT "embeddings_stats_check" CHECK (
        chunk_index >= 0 AND token_count >= 0 AND
        (start_page IS NULL OR start_page >= 0) AND
        (end_page IS NULL OR end_page >= 0)
        )
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases"
(
    "id"                  uuid PRIMARY KEY         DEFAULT gen_random_uuid()        NOT NULL,
    "organization_id"     text                                                      NOT NULL,
    "created_by"          text                                                      NOT NULL,
    "name"                text                                                      NOT NULL,
    "description"         text,
    "embedding_model"     text                     DEFAULT 'text-embedding-3-small' NOT NULL,
    "embedding_dimension" integer                  DEFAULT 1536                     NOT NULL,
    "document_count"      integer                  DEFAULT 0                        NOT NULL,
    "total_tokens"        integer                  DEFAULT 0                        NOT NULL,
    "total_size_bytes"    integer                  DEFAULT 0                        NOT NULL,
    "is_public"           boolean                  DEFAULT false                    NOT NULL,
    "is_deleted"          boolean                  DEFAULT false                    NOT NULL,
    "created_at"          timestamp with time zone DEFAULT now()                    NOT NULL,
    "updated_at"          timestamp with time zone DEFAULT now()                    NOT NULL,
    CONSTRAINT "knowledge_bases_stats_check" CHECK (
        document_count >= 0 AND total_tokens >= 0 AND total_size_bytes >= 0 AND embedding_dimension > 0
        )
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents"
(
    "id"                      uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "knowledge_base_id"       uuid                                               NOT NULL,
    "filename"                text                                               NOT NULL,
    "file_url"                text                                               NOT NULL,
    "file_size_bytes"         integer                                            NOT NULL,
    "mime_type"               text                                               NOT NULL,
    "title"                   text,
    "author"                  text,
    "metadata"                text,
    "chunk_count"             integer                  DEFAULT 0                 NOT NULL,
    "token_count"             integer                  DEFAULT 0                 NOT NULL,
    "processing_status"       "processing_status"      DEFAULT 'pending'         NOT NULL,
    "processing_error"        text,
    "processing_started_at"   timestamp with time zone,
    "processing_completed_at" timestamp with time zone,
    "is_deleted"              boolean                  DEFAULT false             NOT NULL,
    "created_at"              timestamp with time zone DEFAULT now()             NOT NULL,
    "updated_at"              timestamp with time zone DEFAULT now()             NOT NULL,
    CONSTRAINT "knowledge_documents_stats_check" CHECK (
        file_size_bytes > 0 AND chunk_count >= 0 AND token_count >= 0
        )
);
--> statement-breakpoint
CREATE TABLE "chats"
(
    "id"                    uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "organization_id"       text                                               NOT NULL,
    "creator_id"            text                                               NOT NULL,
    "title"                 text                                               NOT NULL,
    "description"           text,
    "instructions"          text,
    "type"                  "chat_type"              DEFAULT 'direct'          NOT NULL,
    "visibility"            "chat_visibility"        DEFAULT 'private'         NOT NULL,
    "orchestration_enabled" boolean                  DEFAULT true              NOT NULL,
    "is_deleted"            boolean                  DEFAULT false             NOT NULL,
    "deleted_at"            timestamp with time zone,
    "created_at"            timestamp with time zone DEFAULT now()             NOT NULL,
    "updated_at"            timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_agents"
(
    "id"                  uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"             uuid                                               NOT NULL,
    "agent_id"            uuid                                               NOT NULL,
    "added_by"            text                                               NOT NULL,
    "is_enabled"          boolean                  DEFAULT true              NOT NULL,
    "custom_instructions" text,
    "custom_temperature"  numeric(3, 2),
    "created_at"          timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_invitations"
(
    "id"          uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"     uuid                                               NOT NULL,
    "inviter_id"  text                                               NOT NULL,
    "email"       text                                               NOT NULL,
    "invitee_id"  text,
    "role"        text                     DEFAULT 'member'          NOT NULL,
    "status"      "invitation_status"      DEFAULT 'pending'         NOT NULL,
    "token"       text                                               NOT NULL,
    "message"     text,
    "expires_at"  timestamp with time zone                           NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at"  timestamp with time zone DEFAULT now()             NOT NULL,
    CONSTRAINT "chat_invitations_token_unique" UNIQUE ("token")
);
--> statement-breakpoint
CREATE TABLE "chat_knowledge_bases"
(
    "id"                uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"           uuid                                               NOT NULL,
    "knowledge_base_id" uuid                                               NOT NULL,
    "added_by"          text                                               NOT NULL,
    "is_enabled"        boolean                  DEFAULT true              NOT NULL,
    "created_at"        timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members"
(
    "id"                    uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"               uuid                                               NOT NULL,
    "user_id"               text                                               NOT NULL,
    "role"                  text                     DEFAULT 'member'          NOT NULL,
    "can_invite"            boolean                  DEFAULT false             NOT NULL,
    "can_manage_agents"     boolean                  DEFAULT false             NOT NULL,
    "can_manage_knowledge"  boolean                  DEFAULT false             NOT NULL,
    "notifications_enabled" boolean                  DEFAULT true              NOT NULL,
    "last_read_at"          timestamp with time zone,
    "unread_count"          integer                  DEFAULT 0                 NOT NULL,
    "is_pinned"             boolean                  DEFAULT false             NOT NULL,
    "pinned_at"             timestamp with time zone,
    "pin_order"             integer,
    "joined_at"             timestamp with time zone DEFAULT now()             NOT NULL,
    "left_at"               timestamp with time zone,
    CONSTRAINT "chat_members_unread_check" CHECK (unread_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "documents"
(
    "id"         uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"    uuid,
    "user_id"    text                                               NOT NULL,
    "title"      text                                               NOT NULL,
    "content"    text,
    "kind"       varchar                  DEFAULT 'text'            NOT NULL,
    "version"    integer                  DEFAULT 1                 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()             NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages"
(
    "id"                uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"           uuid                                               NOT NULL,
    "author_type"       "message_author_type"                              NOT NULL,
    "author_id"         text                                               NOT NULL,
    "role"              text                                               NOT NULL,
    "content"           text                                               NOT NULL,
    "parts"             jsonb                    DEFAULT '[]'::jsonb NOT NULL,
    "attachments"       jsonb                    DEFAULT '[]'::jsonb NOT NULL,
    "token_count"       integer                  DEFAULT 0                 NOT NULL,
    "cost"              numeric(12, 8)           DEFAULT '0',
    "quoted_message_id" uuid,
    "is_edited"         boolean                  DEFAULT false             NOT NULL,
    "edited_at"         timestamp with time zone,
    "is_deleted"        boolean                  DEFAULT false             NOT NULL,
    "deleted_at"        timestamp with time zone,
    "created_at"        timestamp with time zone DEFAULT now()             NOT NULL,
    CONSTRAINT "messages_costs_check" CHECK (token_count >= 0 AND cost >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_reactions"
(
    "id"         uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "message_id" uuid                                               NOT NULL,
    "user_id"    text                                               NOT NULL,
    "emoji"      text                                               NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions"
(
    "id"             uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "document_id"    uuid                                               NOT NULL,
    "user_id"        text                                               NOT NULL,
    "original_text"  text                                               NOT NULL,
    "suggested_text" text                                               NOT NULL,
    "description"    text,
    "is_resolved"    boolean                  DEFAULT false             NOT NULL,
    "created_at"     timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes"
(
    "chat_id"    uuid    NOT NULL,
    "message_id" uuid    NOT NULL,
    "user_id"    text    NOT NULL,
    "is_upvoted" boolean NOT NULL,
    CONSTRAINT "votes_chat_id_message_id_user_id_pk" PRIMARY KEY ("chat_id", "message_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_tool_configs"
(
    "id"            uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "agent_id"      uuid                                               NOT NULL,
    "tool_id"       text                                               NOT NULL,
    "tool_type"     text                                               NOT NULL,
    "config"        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
    "env_overrides" jsonb                    DEFAULT '{}'::jsonb,
    "is_enabled"    boolean                  DEFAULT true              NOT NULL,
    "created_at"    timestamp with time zone DEFAULT now()             NOT NULL,
    "updated_at"    timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_tools"
(
    "id"              text PRIMARY KEY        NOT NULL,
    "organization_id" text,
    "user_id"         text,
    "title"           text                    NOT NULL,
    "schema"          json                    NOT NULL,
    "code"            text                    NOT NULL,
    "created_at"      timestamp DEFAULT now() NOT NULL,
    "updated_at"      timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers"
(
    "id"                    uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"               uuid                                               NOT NULL,
    "created_by"            text,
    "name"                  text                                               NOT NULL,
    "description"           text,
    "transport"             "mcp_transport"                                    NOT NULL,
    "url"                   text,
    "headers"               jsonb                    DEFAULT '{}'::jsonb,
    "timeout"               integer                  DEFAULT 30000,
    "retries"               integer                  DEFAULT 3,
    "is_enabled"            boolean                  DEFAULT true              NOT NULL,
    "connection_status"     "connection_status"      DEFAULT 'disconnected',
    "last_connected_at"     timestamp with time zone,
    "last_error"            text,
    "tool_count"            integer                  DEFAULT 0,
    "last_tools_refresh_at" timestamp with time zone,
    "total_requests"        integer                  DEFAULT 0,
    "last_used_at"          timestamp with time zone,
    "created_at"            timestamp with time zone DEFAULT now()             NOT NULL,
    "updated_at"            timestamp with time zone DEFAULT now()             NOT NULL,
    "deleted_at"            timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mcp_server_tools"
(
    "id"                 uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "mcp_server_id"      uuid                                               NOT NULL,
    "name"               text                                               NOT NULL,
    "description"        text,
    "schema"             jsonb                                              NOT NULL,
    "is_enabled"         boolean                  DEFAULT true              NOT NULL,
    "last_discovered_at" timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_environments"
(
    "id"         uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "chat_id"    uuid                                               NOT NULL,
    "variables"  jsonb                    DEFAULT '{}'::jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_environments"
(
    "id"              uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" text                                               NOT NULL,
    "variables"       jsonb                    DEFAULT '{}'::jsonb NOT NULL,
    "updated_at"      timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_environments"
(
    "id"         uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "user_id"    text                                               NOT NULL,
    "variables"  jsonb                    DEFAULT '{}'::jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices"
(
    "id"                  serial PRIMARY KEY                          NOT NULL,
    "user_id"             text                                        NOT NULL,
    "subscription_id"     integer,
    "type"                "invoice_type"           DEFAULT 'one_time' NOT NULL,
    "provider"            "payment_provider"                          NOT NULL,
    "provider_invoice_id" varchar(255)                                NOT NULL,
    "usd_amount"          numeric(10, 2)                              NOT NULL,
    "status"              "invoice_status"         DEFAULT 'pending'  NOT NULL,
    "description"         varchar(500),
    "metadata"            jsonb,
    "due_date"            timestamp with time zone,
    "paid_at"             timestamp with time zone,
    "failed_at"           timestamp with time zone,
    "created_at"          timestamp with time zone DEFAULT now()      NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items"
(
    "id"             serial PRIMARY KEY                     NOT NULL,
    "invoice_id"     integer                                NOT NULL,
    "description"    varchar(500)                           NOT NULL,
    "quantity"       integer                  DEFAULT 1     NOT NULL,
    "unit_price"     numeric(10, 2)                         NOT NULL,
    "total_price"    numeric(10, 2)                         NOT NULL,
    "reference_type" varchar(100),
    "reference_id"   integer,
    "metadata"       jsonb,
    "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions"
(
    "id"         serial PRIMARY KEY                          NOT NULL,
    "user_id"    text                                        NOT NULL,
    "plan_id"    integer                                     NOT NULL,
    "status"     "subscription_status"    DEFAULT 'inactive' NOT NULL,
    "start_date" timestamp with time zone DEFAULT now()      NOT NULL,
    "end_date"   timestamp with time zone,
    "auto_renew" boolean                  DEFAULT true       NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()      NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_history"
(
    "id"              serial PRIMARY KEY                     NOT NULL,
    "subscription_id" integer                                NOT NULL,
    "plan_id"         integer                                NOT NULL,
    "old_status"      "subscription_status",
    "new_status"      "subscription_status"                  NOT NULL,
    "reason"          varchar(255),
    "metadata"        jsonb,
    "changed_at"      timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans"
(
    "id"                    serial PRIMARY KEY                     NOT NULL,
    "name"                  varchar(100)                           NOT NULL,
    "slug"                  varchar(100)                           NOT NULL,
    "description"           varchar(500),
    "usd_price"             numeric(10, 2)                         NOT NULL,
    "billing_interval_days" integer                  DEFAULT 30    NOT NULL,
    "features"              jsonb,
    "is_active"             boolean                  DEFAULT true  NOT NULL,
    "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "subscription_plans_slug_unique" UNIQUE ("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_metrics"
(
    "id"              serial PRIMARY KEY                     NOT NULL,
    "user_id"         text                                   NOT NULL,
    "subscription_id" integer,
    "metric"          varchar(100)                           NOT NULL,
    "count"           integer                  DEFAULT 1     NOT NULL,
    "period_start"    timestamp with time zone               NOT NULL,
    "period_end"      timestamp with time zone               NOT NULL,
    "recorded_at"     timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs"
(
    "id"            serial PRIMARY KEY                     NOT NULL,
    "provider"      "payment_provider"                     NOT NULL,
    "event_type"    varchar(100)                           NOT NULL,
    "invoice_id"    varchar(255),
    "payload"       jsonb                                  NOT NULL,
    "signature"     text,
    "status"        varchar(50)                            NOT NULL,
    "error_message" text,
    "attempts"      integer                  DEFAULT 1     NOT NULL,
    "processed_at"  timestamp with time zone,
    "created_at"    timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs"
(
    "id"          uuid PRIMARY KEY         DEFAULT gen_random_uuid() NOT NULL,
    "entity_type" text                                               NOT NULL,
    "entity_id"   text                                               NOT NULL,
    "action"      text                                               NOT NULL,
    "actor_id"    text,
    "actor_type"  "audit_actor_type",
    "changes"     jsonb,
    "metadata"    jsonb,
    "ip_address"  text,
    "user_agent"  text,
    "created_at"  timestamp with time zone DEFAULT now()             NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"
    ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"
    ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions"
    ADD CONSTRAINT "permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings"
    ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats"
    ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"
    ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"
    ADD CONSTRAINT "agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_queue"
    ADD CONSTRAINT "document_processing_queue_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings"
    ADD CONSTRAINT "embeddings_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings"
    ADD CONSTRAINT "embeddings_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases"
    ADD CONSTRAINT "knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases"
    ADD CONSTRAINT "knowledge_bases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"
    ADD CONSTRAINT "chats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"
    ADD CONSTRAINT "chats_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents"
    ADD CONSTRAINT "chat_agents_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents"
    ADD CONSTRAINT "chat_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agents"
    ADD CONSTRAINT "chat_agents_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations"
    ADD CONSTRAINT "chat_invitations_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations"
    ADD CONSTRAINT "chat_invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invitations"
    ADD CONSTRAINT "chat_invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases"
    ADD CONSTRAINT "chat_knowledge_bases_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases"
    ADD CONSTRAINT "chat_knowledge_bases_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases"
    ADD CONSTRAINT "chat_knowledge_bases_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members"
    ADD CONSTRAINT "chat_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members"
    ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions"
    ADD CONSTRAINT "suggestions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions"
    ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes"
    ADD CONSTRAINT "votes_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes"
    ADD CONSTRAINT "votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes"
    ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_configs"
    ADD CONSTRAINT "agent_tool_configs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools"
    ADD CONSTRAINT "custom_tools_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools"
    ADD CONSTRAINT "custom_tools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers"
    ADD CONSTRAINT "mcp_servers_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers"
    ADD CONSTRAINT "mcp_servers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server_tools"
    ADD CONSTRAINT "mcp_server_tools_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_environments"
    ADD CONSTRAINT "chat_environments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_environments"
    ADD CONSTRAINT "organization_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_environments"
    ADD CONSTRAINT "user_environments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans" ("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history"
    ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history"
    ADD CONSTRAINT "subscription_history_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans" ("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics"
    ADD CONSTRAINT "usage_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics"
    ADD CONSTRAINT "usage_metrics_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions" ("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_org_idx" ON "members" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "members_org_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_unique" ON "permissions" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "permissions_entity_idx" ON "permissions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agents_org_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agents_creator_idx" ON "agents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "agents_visibility_idx" ON "agents" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_name_idx" ON "agents" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_queue_document_idx" ON "document_processing_queue" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_queue_status_priority_idx" ON "document_processing_queue" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "embeddings_kb_idx" ON "embeddings" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "embeddings_doc_idx" ON "embeddings" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_doc_chunk_idx" ON "embeddings" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "embeddings_vector_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "embeddings_fts_idx" ON "embeddings" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "knowledge_bases_org_idx" ON "knowledge_bases" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bases_org_name_idx" ON "knowledge_bases" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "knowledge_documents_kb_idx" ON "knowledge_documents" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_status_idx" ON "knowledge_documents" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "knowledge_documents_kb_status_idx" ON "knowledge_documents" USING btree ("knowledge_base_id","processing_status");--> statement-breakpoint
CREATE INDEX "chats_org_idx" ON "chats" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chats_creator_idx" ON "chats" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "chats_org_created_idx" ON "chats" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agents_chat_agent_idx" ON "chat_agents" USING btree ("chat_id","agent_id");--> statement-breakpoint
CREATE INDEX "chat_agents_chat_idx" ON "chat_agents" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitations_chat_idx" ON "chat_invitations" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_invitations_email_idx" ON "chat_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "chat_invitations_token_idx" ON "chat_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_kb_chat_kb_idx" ON "chat_knowledge_bases" USING btree ("chat_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "chat_kb_chat_idx" ON "chat_knowledge_bases" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_members_chat_user_idx" ON "chat_members" USING btree ("chat_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user_pinned_idx" ON "chat_members" USING btree ("user_id","is_pinned");--> statement-breakpoint
CREATE INDEX "documents_chat_idx" ON "documents" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "documents_user_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_chat_created_idx" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_type","author_id");--> statement-breakpoint
CREATE INDEX "messages_quoted_idx" ON "messages" USING btree ("quoted_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_unique" ON "message_reactions" USING btree ("user_id","message_id","emoji");--> statement-breakpoint
CREATE INDEX "message_reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "suggestions_document_idx" ON "suggestions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "agent_tool_configs_agent_idx" ON "agent_tool_configs" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tool_configs_agent_tool_idx" ON "agent_tool_configs" USING btree ("agent_id","tool_id");--> statement-breakpoint
CREATE INDEX "custom_tools_organization_id_idx" ON "custom_tools" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_chat_idx" ON "mcp_servers" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_chat_enabled_idx" ON "mcp_servers" USING btree ("chat_id","is_enabled");--> statement-breakpoint
CREATE INDEX "mcp_server_tools_server_idx" ON "mcp_server_tools" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_server_tools_server_name_idx" ON "mcp_server_tools" USING btree ("mcp_server_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_env_chat_idx" ON "chat_environments" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_env_org_idx" ON "organization_environments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_env_user_idx" ON "user_environments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_provider_idx" ON "invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_end_date_idx" ON "subscriptions" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "subscription_history_sub_idx" ON "subscription_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_plans_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_metrics_user_metric_period_idx" ON "usage_metrics" USING btree ("user_id","metric","period_start");--> statement-breakpoint
CREATE INDEX "webhook_logs_provider_idx" ON "webhook_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "webhook_logs_status_idx" ON "webhook_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");