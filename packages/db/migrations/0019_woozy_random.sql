CREATE TYPE "public"."skill_assignment_scope" AS ENUM('organization', 'chat', 'agent');--> statement-breakpoint
CREATE TYPE "public"."skill_source_type" AS ENUM('manual', 'mcp');--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"source_type" "skill_source_type" DEFAULT 'manual' NOT NULL,
	"mcp_integration_id" uuid,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"scope" "skill_assignment_scope" NOT NULL,
	"chat_id" uuid,
	"agent_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_assignments_target_check" CHECK ((
				(scope = 'organization' AND chat_id IS NULL AND agent_id IS NULL)
				OR (scope = 'chat' AND chat_id IS NOT NULL AND agent_id IS NULL)
				OR (scope = 'agent' AND chat_id IS NULL AND agent_id IS NOT NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_name_idx" ON "skills" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "skills_org_enabled_idx" ON "skills" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE INDEX "skills_mcp_idx" ON "skills" USING btree ("mcp_integration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_assignments_unique_target_idx" ON "skill_assignments" USING btree ("skill_id","scope","chat_id","agent_id");--> statement-breakpoint
CREATE INDEX "skill_assignments_chat_idx" ON "skill_assignments" USING btree ("chat_id","enabled");--> statement-breakpoint
CREATE INDEX "skill_assignments_agent_idx" ON "skill_assignments" USING btree ("agent_id","enabled");