CREATE TABLE "mcp_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_only_hint" boolean,
	"enabled" boolean DEFAULT false NOT NULL,
	"approval_mode" "mcp_tool_approval_mode" DEFAULT 'prompt' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"saved_memory_enabled" boolean DEFAULT true NOT NULL,
	"chat_history_enabled" boolean DEFAULT true NOT NULL,
	"automatic_management_enabled" boolean DEFAULT true NOT NULL,
	"summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" DROP CONSTRAINT "memories_scope_target_check";
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_integrations" ADD COLUMN "status" "mcp_integration_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
UPDATE "mcp_integrations" SET "status" = 'published' WHERE "enabled" = true;
--> statement-breakpoint
ALTER TABLE "mcp_integrations" ADD COLUMN "last_scanned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mcp_integrations" ADD COLUMN "last_scan_error" text;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "importance" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mcp_tools" ADD CONSTRAINT "mcp_tools_integration_id_mcp_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."mcp_integrations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_preferences" ADD CONSTRAINT "memory_preferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_preferences" ADD CONSTRAINT "memory_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tools_integration_name_idx" ON "mcp_tools" USING btree ("integration_id","name");
--> statement-breakpoint
CREATE INDEX "mcp_tools_integration_enabled_idx" ON "mcp_tools" USING btree ("integration_id","enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX "memory_preferences_org_user_idx" ON "memory_preferences" USING btree ("organization_id","user_id");
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_scope_target_check" CHECK ((
				("memories"."scope"::text = 'user' AND "memories"."user_id" IS NOT NULL AND "memories"."chat_id" IS NULL AND "memories"."agent_id" IS NULL)
				OR ("memories"."scope" = 'organization' AND "memories"."user_id" IS NULL AND "memories"."chat_id" IS NULL AND "memories"."agent_id" IS NULL)
				OR ("memories"."scope" = 'chat' AND "memories"."user_id" IS NULL AND "memories"."chat_id" IS NOT NULL AND "memories"."agent_id" IS NULL)
				OR ("memories"."scope" = 'agent' AND "memories"."user_id" IS NULL AND "memories"."chat_id" IS NULL AND "memories"."agent_id" IS NOT NULL)
			));
