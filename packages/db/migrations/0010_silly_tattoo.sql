CREATE TYPE "public"."human_approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mcp_scope" AS ENUM('organization', 'chat', 'agent');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport" AS ENUM('sse', 'streamable_http');--> statement-breakpoint
CREATE TYPE "public"."scheduled_task_schedule_type" AS ENUM('once', 'interval', 'cron');--> statement-breakpoint
CREATE TYPE "public"."scheduled_task_status" AS ENUM('active', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_handoff_status" AS ENUM('pending', 'accepted', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "human_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"workflow_run_id" text,
	"requested_by" text NOT NULL,
	"approver_user_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"requested_action" jsonb NOT NULL,
	"status" "human_approval_status" DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"transport" "mcp_transport" NOT NULL,
	"endpoint" text NOT NULL,
	"credential_ref" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_integration_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"scope" "mcp_scope" NOT NULL,
	"chat_id" uuid,
	"agent_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"chat_id" uuid,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule_type" "scheduled_task_schedule_type" NOT NULL,
	"schedule" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "scheduled_task_status" DEFAULT 'active' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"to_user_id" text,
	"created_by" text NOT NULL,
	"task" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "task_handoff_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "human_approvals" ADD CONSTRAINT "human_approvals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_approvals" ADD CONSTRAINT "human_approvals_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_approvals" ADD CONSTRAINT "human_approvals_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_approvals" ADD CONSTRAINT "human_approvals_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_integrations" ADD CONSTRAINT "mcp_integrations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_integrations" ADD CONSTRAINT "mcp_integrations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_integration_links" ADD CONSTRAINT "mcp_integration_links_integration_id_mcp_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."mcp_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_integration_links" ADD CONSTRAINT "mcp_integration_links_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_integration_links" ADD CONSTRAINT "mcp_integration_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_handoffs" ADD CONSTRAINT "task_handoffs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "human_approvals_chat_idx" ON "human_approvals" USING btree ("chat_id","status","created_at");--> statement-breakpoint
CREATE INDEX "human_approvals_assignee_idx" ON "human_approvals" USING btree ("approver_user_id","status");--> statement-breakpoint
CREATE INDEX "mcp_integrations_org_idx" ON "mcp_integrations" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE INDEX "mcp_links_integration_idx" ON "mcp_integration_links" USING btree ("integration_id","enabled");--> statement-breakpoint
CREATE INDEX "mcp_links_chat_idx" ON "mcp_integration_links" USING btree ("chat_id","enabled");--> statement-breakpoint
CREATE INDEX "mcp_links_agent_idx" ON "mcp_integration_links" USING btree ("agent_id","enabled");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_org_idx" ON "scheduled_tasks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_due_idx" ON "scheduled_tasks" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "task_handoffs_chat_idx" ON "task_handoffs" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "task_handoffs_recipient_idx" ON "task_handoffs" USING btree ("to_agent_id","to_user_id","status");